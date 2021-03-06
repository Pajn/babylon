/* eslint indent: 0 */
/* eslint max-len: 0 */

import { types as tt } from "../tokenizer/types";
import { types as ct } from "../tokenizer/context";
import Parser from "../parser";

const pp = Parser.prototype;

pp.tsParseTypeInitialiser = function (tok) {
  const oldInType = this.state.inType;
  this.state.inType = true;
  this.expect(tok || tt.colon);

  const type = this.tsParseType();
  this.state.inType = oldInType;
  return type;
};

pp.tsParseDeclareClass = function (node) {
  this.next();
  this.tsParseInterfaceish(node, true);
  return this.finishNode(node, "DeclareClass");
};

pp.tsParseDeclareFunction = function (node) {
  this.next();

  const id = node.id = this.parseIdentifier();

  const typeNode = this.startNode();
  const typeContainer = this.startNode();

  if (this.isRelational("<")) {
    typeNode.typeParameters = this.tsParseTypeParameterDeclaration();
  } else {
    typeNode.typeParameters = null;
  }

  this.expect(tt.parenL);
  const tmp = this.tsParseFunctionTypeParams();
  typeNode.params = tmp.params;
  typeNode.rest = tmp.rest;
  this.expect(tt.parenR);
  typeNode.returnType = this.tsParseTypeInitialiser();

  typeContainer.typeAnnotation = this.finishNode(typeNode, "FunctionTypeAnnotation");
  id.typeAnnotation = this.finishNode(typeContainer, "TypeAnnotation");

  this.finishNode(id, id.type);

  this.semicolon();

  return this.finishNode(node, "DeclareFunction");
};

pp.tsParseDeclare = function (node) {
  if (this.match(tt._class)) {
    return this.tsParseDeclareClass(node);
  } else if (this.match(tt._function)) {
    return this.tsParseDeclareFunction(node);
  } else if (this.match(tt._var)) {
    return this.tsParseDeclareVariable(node);
  } else if (this.isContextual("module")) {
    if (this.lookahead().type === tt.dot) {
      return this.tsParseDeclareModuleExports(node);
    } else {
      return this.tsParseDeclareModule(node);
    }
  } else if (this.isContextual("type")) {
    return this.tsParseDeclareTypeAlias(node);
  } else if (this.isContextual("interface")) {
    return this.tsParseDeclareInterface(node);
  } else {
    this.unexpected();
  }
};

pp.tsParseDeclareVariable = function (node) {
  this.next();
  node.id = this.tsParseTypeAnnotatableIdentifier();
  this.semicolon();
  return this.finishNode(node, "DeclareVariable");
};

pp.tsParseDeclareModule = function (node) {
  this.next();

  if (this.match(tt.string)) {
    node.id = this.parseExprAtom();
  } else {
    node.id = this.parseIdentifier();
  }

  const bodyNode = node.body = this.startNode();
  const body = bodyNode.body = [];
  this.expect(tt.braceL);
  while (!this.match(tt.braceR)) {
    const node2 = this.startNode();

    this.expectContextual("declare", "Unexpected token. Only declares are allowed inside declare module");

    body.push(this.tsParseDeclare(node2));
  }
  this.expect(tt.braceR);

  this.finishNode(bodyNode, "BlockStatement");
  return this.finishNode(node, "DeclareModule");
};

pp.tsParseDeclareModuleExports = function (node) {
  this.expectContextual("module");
  this.expect(tt.dot);
  this.expectContextual("exports");
  node.typeAnnotation = this.tsParseTypeAnnotation();
  this.semicolon();

  return this.finishNode(node, "DeclareModuleExports");
};

pp.tsParseDeclareTypeAlias = function (node) {
  this.next();
  this.tsParseTypeAlias(node);
  return this.finishNode(node, "DeclareTypeAlias");
};

pp.tsParseDeclareInterface = function (node) {
  this.next();
  this.tsParseInterfaceish(node);
  return this.finishNode(node, "DeclareInterface");
};

// Interfaces

pp.tsParseInterfaceish = function (node, allowStatic) {
  node.id = this.parseIdentifier();

  if (this.isRelational("<")) {
    node.typeParameters = this.tsParseTypeParameterDeclaration();
  } else {
    node.typeParameters = null;
  }

  node.extends = [];
  node.mixins = [];

  if (this.eat(tt._extends)) {
    do {
      node.extends.push(this.tsParseInterfaceExtends());
    } while (this.eat(tt.comma));
  }

  if (this.isContextual("mixins")) {
    this.next();
    do {
      node.mixins.push(this.tsParseInterfaceExtends());
    } while (this.eat(tt.comma));
  }

  node.body = this.tsParseObjectType(allowStatic);
};

pp.tsParseInterfaceExtends = function () {
  const node = this.startNode();

  node.id = this.tsParseQualifiedTypeIdentifier();
  if (this.isRelational("<")) {
    node.typeParameters = this.tsParseTypeParameterInstantiation();
  } else {
    node.typeParameters = null;
  }

  return this.finishNode(node, "InterfaceExtends");
};

pp.tsParseInterface = function (node) {
  this.tsParseInterfaceish(node, false);
  return this.finishNode(node, "InterfaceDeclaration");
};

// Type aliases

pp.tsParseTypeAlias = function (node) {
  node.id = this.parseIdentifier();

  if (this.isRelational("<")) {
    node.typeParameters = this.tsParseTypeParameterDeclaration();
  } else {
    node.typeParameters = null;
  }

  node.right = this.tsParseTypeInitialiser(tt.eq);
  this.semicolon();

  return this.finishNode(node, "TypeAlias");
};

// Type annotations

pp.tsParseTypeParameter = function () {
  const node = this.startNode();

  const variance = this.tsParseVariance();

  const ident = this.tsParseTypeAnnotatableIdentifier();
  node.name = ident.name;
  node.variance = variance;
  node.bound = ident.typeAnnotation;

  if (this.match(tt.eq)) {
    this.eat(tt.eq);
    node.default = this.tsParseType ();
  }

  return this.finishNode(node, "TypeParameter");
};

pp.tsParseTypeParameterDeclaration = function () {
  const oldInType = this.state.inType;
  const node = this.startNode();
  node.params = [];

  this.state.inType = true;

  // istanbul ignore else: this condition is already checked at all call sites
  if (this.isRelational("<") || this.match(tt.jsxTagStart)) {
    this.next();
  } else {
    this.unexpected();
  }

  do {
    node.params.push(this.tsParseTypeParameter());
    if (!this.isRelational(">")) {
      this.expect(tt.comma);
    }
  } while (!this.isRelational(">"));
  this.expectRelational(">");

  this.state.inType = oldInType;

  return this.finishNode(node, "TypeParameterDeclaration");
};

pp.tsParseTypeParameterInstantiation = function () {
  const node = this.startNode();
  const oldInType = this.state.inType;
  node.params = [];

  this.state.inType = true;

  this.expectRelational("<");
  while (!this.isRelational(">")) {
    node.params.push(this.tsParseType());
    if (!this.isRelational(">")) {
      this.expect(tt.comma);
    }
  }
  this.expectRelational(">");

  this.state.inType = oldInType;

  return this.finishNode(node, "TypeParameterInstantiation");
};

pp.tsParseObjectPropertyKey = function () {
  return (this.match(tt.num) || this.match(tt.string)) ? this.parseExprAtom() : this.parseIdentifier(true);
};

pp.tsParseObjectTypeIndexer = function (node, isStatic, variance) {
  node.static = isStatic;

  this.expect(tt.bracketL);
  if (this.lookahead().type === tt.colon) {
    node.id = this.tsParseObjectPropertyKey();
    node.key = this.tsParseTypeInitialiser();
  } else {
    node.id = null;
    node.key = this.tsParseType();
  }
  this.expect(tt.bracketR);
  node.value = this.tsParseTypeInitialiser();
  node.variance = variance;

  this.tsObjectTypeSemicolon();
  return this.finishNode(node, "ObjectTypeIndexer");
};

pp.tsParseObjectTypeMethodish = function (node) {
  node.params = [];
  node.rest = null;
  node.typeParameters = null;

  if (this.isRelational("<")) {
    node.typeParameters = this.tsParseTypeParameterDeclaration();
  }

  this.expect(tt.parenL);
  while (this.match(tt.name)) {
    node.params.push(this.tsParseFunctionTypeParam());
    if (!this.match(tt.parenR)) {
      this.expect(tt.comma);
    }
  }

  if (this.eat(tt.ellipsis)) {
    node.rest = this.tsParseFunctionTypeParam();
  }
  this.expect(tt.parenR);
  node.returnType = this.tsParseTypeInitialiser();

  return this.finishNode(node, "FunctionTypeAnnotation");
};

pp.tsParseObjectTypeMethod = function (startPos, startLoc, isStatic, key) {
  const node = this.startNodeAt(startPos, startLoc);
  node.value = this.tsParseObjectTypeMethodish(this.startNodeAt(startPos, startLoc));
  node.static = isStatic;
  node.key = key;
  node.optional = false;
  this.tsObjectTypeSemicolon();
  return this.finishNode(node, "ObjectTypeProperty");
};

pp.tsParseObjectTypeCallProperty = function (node, isStatic) {
  const valueNode = this.startNode();
  node.static = isStatic;
  node.value = this.tsParseObjectTypeMethodish(valueNode);
  this.tsObjectTypeSemicolon();
  return this.finishNode(node, "ObjectTypeCallProperty");
};

pp.tsParseObjectType = function (allowStatic, allowExact) {
  const oldInType = this.state.inType;
  this.state.inType = true;

  const nodeStart = this.startNode();
  let node;
  let propertyKey;
  let isStatic = false;

  nodeStart.callProperties = [];
  nodeStart.properties = [];
  nodeStart.indexers = [];

  let endDelim;
  let exact;
  if (allowExact && this.match(tt.braceBarL)) {
    this.expect(tt.braceBarL);
    endDelim = tt.braceBarR;
    exact = true;
  } else {
    this.expect(tt.braceL);
    endDelim = tt.braceR;
    exact = false;
  }

  nodeStart.exact = exact;

  while (!this.match(endDelim)) {
    let optional = false;
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    node = this.startNode();
    if (allowStatic && this.isContextual("static") && this.lookahead().type !== tt.colon) {
      this.next();
      isStatic = true;
    }

    const variancePos = this.state.start;
    const variance = this.tsParseVariance();

    if (this.match(tt.bracketL)) {
      nodeStart.indexers.push(this.tsParseObjectTypeIndexer(node, isStatic, variance));
    } else if (this.match(tt.parenL) || this.isRelational("<")) {
      if (variance) {
        this.unexpected(variancePos);
      }
      nodeStart.callProperties.push(this.tsParseObjectTypeCallProperty(node, allowStatic));
    } else {
      propertyKey = this.tsParseObjectPropertyKey();
      if (this.isRelational("<") || this.match(tt.parenL)) {
        // This is a method property
        if (variance) {
          this.unexpected(variancePos);
        }
        nodeStart.properties.push(this.tsParseObjectTypeMethod(startPos, startLoc, isStatic, propertyKey));
      } else {
        if (this.eat(tt.question)) {
          optional = true;
        }
        node.key = propertyKey;
        node.value = this.tsParseTypeInitialiser();
        node.optional = optional;
        node.static = isStatic;
        node.variance = variance;
        this.tsObjectTypeSemicolon();
        nodeStart.properties.push(this.finishNode(node, "ObjectTypeProperty"));
      }
    }

    isStatic = false;
  }

  this.expect(endDelim);

  const out = this.finishNode(nodeStart, "ObjectTypeAnnotation");

  this.state.inType = oldInType;

  return out;
};

pp.tsObjectTypeSemicolon = function () {
  if (!this.eat(tt.semi) && !this.eat(tt.comma) &&
      !this.match(tt.braceR) && !this.match(tt.braceBarR)) {
    this.unexpected();
  }
};

pp.tsParseQualifiedTypeIdentifier = function (startPos, startLoc, id) {
  startPos = startPos || this.state.start;
  startLoc = startLoc || this.state.startLoc;
  let node = id || this.parseIdentifier();

  while (this.eat(tt.dot)) {
    const node2 = this.startNodeAt(startPos, startLoc);
    node2.qualification = node;
    node2.id = this.parseIdentifier();
    node = this.finishNode(node2, "QualifiedTypeIdentifier");
  }

  return node;
};

pp.tsParseGenericType = function (startPos, startLoc, id) {
  const node = this.startNodeAt(startPos, startLoc);

  node.typeParameters = null;
  node.id = this.tsParseQualifiedTypeIdentifier(startPos, startLoc, id);

  if (this.isRelational("<")) {
    node.typeParameters = this.tsParseTypeParameterInstantiation();
  }

  return this.finishNode(node, "GenericTypeAnnotation");
};

pp.tsParseTypeofType = function () {
  const node = this.startNode();
  this.expect(tt._typeof);
  node.argument = this.tsParsePrimaryType();
  return this.finishNode(node, "TypeofTypeAnnotation");
};

pp.tsParseTupleType = function () {
  const node = this.startNode();
  node.types = [];
  this.expect(tt.bracketL);
  // We allow trailing commas
  while (this.state.pos < this.input.length && !this.match(tt.bracketR)) {
    node.types.push(this.tsParseType());
    if (this.match(tt.bracketR)) break;
    this.expect(tt.comma);
  }
  this.expect(tt.bracketR);
  return this.finishNode(node, "TupleTypeAnnotation");
};

pp.tsParseFunctionTypeParam = function () {
  let name = null;
  let optional = false;
  let typeAnnotation = null;
  const node = this.startNode();
  const lh = this.lookahead();
  if (lh.type === tt.colon ||
      lh.type === tt.question) {
    name = this.parseIdentifier();
    if (this.eat(tt.question)) {
      optional = true;
    }
    typeAnnotation = this.tsParseTypeInitialiser();
  } else {
    typeAnnotation = this.tsParseType();
  }
  node.name = name;
  node.optional = optional;
  node.typeAnnotation = typeAnnotation;
  return this.finishNode(node, "FunctionTypeParam");
};

pp.reinterpretTypeAsFunctionTypeParam = function (type) {
  const node = this.startNodeAt(type.start, type.loc);
  node.name = null;
  node.optional = false;
  node.typeAnnotation = type;
  return this.finishNode(node, "FunctionTypeParam");
};

pp.tsParseFunctionTypeParams = function (params = []) {
  const ret = { params, rest: null };
  while (this.match(tt.name)) {
    ret.params.push(this.tsParseFunctionTypeParam());
    if (!this.match(tt.parenR)) {
      this.expect(tt.comma);
    }
  }
  if (this.eat(tt.ellipsis)) {
    ret.rest = this.tsParseFunctionTypeParam();
  }
  return ret;
};

pp.tsIdentToTypeAnnotation = function (startPos, startLoc, node, id) {
  switch (id.name) {
    case "any":
      return this.finishNode(node, "AnyTypeAnnotation");

    case "void":
      return this.finishNode(node, "VoidTypeAnnotation");

    case "bool":
    case "boolean":
      return this.finishNode(node, "BooleanTypeAnnotation");

    case "mixed":
      return this.finishNode(node, "MixedTypeAnnotation");

    case "empty":
      return this.finishNode(node, "EmptyTypeAnnotation");

    case "number":
      return this.finishNode(node, "NumberTypeAnnotation");

    case "string":
      return this.finishNode(node, "StringTypeAnnotation");

    default:
      return this.tsParseGenericType(startPos, startLoc, id);
  }
};

// The parsing of types roughly parallels the parsing of expressions, and
// primary types are kind of like primary expressions...they're the
// primitives with which other types are constructed.
pp.tsParsePrimaryType = function () {
  const startPos = this.state.start;
  const startLoc = this.state.startLoc;
  const node = this.startNode();
  let tmp;
  let type;
  let isGroupedType = false;
  const oldNoAnonFunctionType = this.state.noAnonFunctionType;

  switch (this.state.type) {
    case tt.name:
      return this.tsIdentToTypeAnnotation(startPos, startLoc, node, this.parseIdentifier());

    case tt.braceL:
      return this.tsParseObjectType(false, false);

    case tt.braceBarL:
      return this.tsParseObjectType(false, true);

    case tt.bracketL:
      return this.tsParseTupleType();

    case tt.relational:
      if (this.state.value === "<") {
        node.typeParameters = this.tsParseTypeParameterDeclaration();
        this.expect(tt.parenL);
        tmp = this.tsParseFunctionTypeParams();
        node.params = tmp.params;
        node.rest = tmp.rest;
        this.expect(tt.parenR);

        this.expect(tt.arrow);

        node.returnType = this.tsParseType();

        return this.finishNode(node, "FunctionTypeAnnotation");
      }
      break;

    case tt.parenL:
      this.next();

      // Check to see if this is actually a grouped type
      if (!this.match(tt.parenR) && !this.match(tt.ellipsis)) {
        if (this.match(tt.name)) {
          const token = this.lookahead().type;
          isGroupedType = token !== tt.question && token !== tt.colon;
        } else {
          isGroupedType = true;
        }
      }

      if (isGroupedType) {
        this.state.noAnonFunctionType = false;
        type = this.tsParseType();
        this.state.noAnonFunctionType = oldNoAnonFunctionType;

        // A `,` or a `) =>` means this is an anonymous function type
        if (this.state.noAnonFunctionType ||
            !(this.match(tt.comma) ||
             (this.match(tt.parenR) && this.lookahead().type === tt.arrow))) {
          this.expect(tt.parenR);
          return type;
        } else {
          // Eat a comma if there is one
          this.eat(tt.comma);
        }
      }

      if (type) {
        tmp = this.tsParseFunctionTypeParams(
          [this.reinterpretTypeAsFunctionTypeParam(type)],
        );
      } else {
        tmp = this.tsParseFunctionTypeParams();
      }

      node.params = tmp.params;
      node.rest = tmp.rest;

      this.expect(tt.parenR);

      this.expect(tt.arrow);

      node.returnType = this.tsParseType();

      node.typeParameters = null;

      return this.finishNode(node, "FunctionTypeAnnotation");

    case tt.string:
      node.value = this.state.value;
      this.addExtra(node, "rawValue", node.value);
      this.addExtra(node, "raw", this.input.slice(this.state.start, this.state.end));
      this.next();
      return this.finishNode(node, "StringLiteralTypeAnnotation");

    case tt._true: case tt._false:
      node.value = this.match(tt._true);
      this.next();
      return this.finishNode(node, "BooleanLiteralTypeAnnotation");

    case tt.plusMin:
      if (this.state.value === "-") {
        this.next();
        if (!this.match(tt.num)) this.unexpected();

        node.value = -this.state.value;
        this.addExtra(node, "rawValue", node.value);
        this.addExtra(node, "raw", this.input.slice(this.state.start, this.state.end));
        this.next();
        return this.finishNode(node, "NumericLiteralTypeAnnotation");
      }

    case tt.num:
      node.value = this.state.value;
      this.addExtra(node, "rawValue", node.value);
      this.addExtra(node, "raw", this.input.slice(this.state.start, this.state.end));
      this.next();
      return this.finishNode(node, "NumericLiteralTypeAnnotation");

    case tt._null:
      node.value = this.match(tt._null);
      this.next();
      return this.finishNode(node, "NullLiteralTypeAnnotation");

    case tt._this:
      node.value = this.match(tt._this);
      this.next();
      return this.finishNode(node, "ThisTypeAnnotation");

    case tt.star:
      this.next();
      return this.finishNode(node, "ExistentialTypeParam");

    default:
      if (this.state.type.keyword === "typeof") {
        return this.tsParseTypeofType();
      }
  }

  this.unexpected();
};

pp.tsParsePostfixType = function () {
  const startPos = this.state.start, startLoc = this.state.startLoc;
  let type = this.tsParsePrimaryType();
  while (!this.canInsertSemicolon() && this.match(tt.bracketL)) {
    const node = this.startNodeAt(startPos, startLoc);
    node.elementType = type;
    this.expect(tt.bracketL);
    this.expect(tt.bracketR);
    type = this.finishNode(node, "ArrayTypeAnnotation");
  }
  return type;
};

pp.tsParsePrefixType = function () {
  const node = this.startNode();
  if (this.eat(tt.question)) {
    node.typeAnnotation = this.tsParsePrefixType();
    return this.finishNode(node, "NullableTypeAnnotation");
  } else {
    return this.tsParsePostfixType();
  }
};

pp.tsParseAnonFunctionWithoutParens = function () {
  const param = this.tsParsePrefixType();
  if (!this.state.noAnonFunctionType && this.eat(tt.arrow)) {
    const node  = this.startNodeAt(param.start, param.loc);
    node.params = [this.reinterpretTypeAsFunctionTypeParam(param)];
    node.rest = null;
    node.returnType = this.tsParseType();
    node.typeParameters = null;
    return this.finishNode(node, "FunctionTypeAnnotation");
  }
  return param;
};

pp.tsParseIntersectionType = function () {
  const node = this.startNode();
  this.eat(tt.bitwiseAND);
  const type = this.tsParseAnonFunctionWithoutParens();
  node.types = [type];
  while (this.eat(tt.bitwiseAND)) {
    node.types.push(this.tsParseAnonFunctionWithoutParens());
  }
  return node.types.length === 1 ? type : this.finishNode(node, "IntersectionTypeAnnotation");
};

pp.tsParseUnionType = function () {
  const node = this.startNode();
  this.eat(tt.bitwiseOR);
  const type = this.tsParseIntersectionType();
  node.types = [type];
  while (this.eat(tt.bitwiseOR)) {
    node.types.push(this.tsParseIntersectionType());
  }
  return node.types.length === 1 ? type : this.finishNode(node, "UnionTypeAnnotation");
};

pp.tsParseType = function () {
  const oldInType = this.state.inType;
  this.state.inType = true;
  const type = this.tsParseUnionType();
  this.state.inType = oldInType;
  return type;
};

pp.tsParseTypeAnnotation = function () {
  const node = this.startNode();
  node.typeAnnotation = this.tsParseTypeInitialiser();
  return this.finishNode(node, "TypeAnnotation");
};

pp.tsParseTypeAnnotatableIdentifier = function () {
  const ident = this.parseIdentifier();
  if (this.match(tt.colon)) {
    ident.typeAnnotation = this.tsParseTypeAnnotation();
    this.finishNode(ident, ident.type);
  }
  return ident;
};

pp.typeCastToParameter = function (node) {
  node.expression.typeAnnotation = node.typeAnnotation;

  return this.finishNodeAt(
    node.expression,
    node.expression.type,
    node.typeAnnotation.end,
    node.typeAnnotation.loc.end
  );
};

pp.tsParseVariance = function() {
  let variance = null;
  if (this.match(tt.plusMin)) {
    if (this.state.value === "+") {
      variance = "plus";
    } else if (this.state.value === "-") {
      variance = "minus";
    }
    this.next();
  }
  return variance;
};

export default function (instance) {
  // plain function return types: function name(): string {}
  instance.extend("parseFunctionBody", function (inner) {
    return function (node, allowExpression) {
      if (this.match(tt.colon) && !allowExpression) {
        // if allowExpression is true then we're parsing an arrow function and if
        // there's a return type then it's been handled elsewhere
        node.returnType = this.tsParseTypeAnnotation();
      }

      return inner.call(this, node, allowExpression);
    };
  });

  // interfaces
  instance.extend("parseStatement", function (inner) {
    return function (declaration, topLevel) {
      // strict mode handling of `interface` since it's a reserved word
      if (this.state.strict && this.match(tt.name) && this.state.value === "interface") {
        const node = this.startNode();
        this.next();
        return this.tsParseInterface(node);
      } else {
        return inner.call(this, declaration, topLevel);
      }
    };
  });

  // declares, interfaces and type aliases
  instance.extend("parseExpressionStatement", function (inner) {
    return function (node, expr) {
      if (expr.type === "Identifier") {
        if (expr.name === "declare") {
          if (this.match(tt._class) || this.match(tt.name) || this.match(tt._function) || this.match(tt._var)) {
            return this.tsParseDeclare(node);
          }
        } else if (this.match(tt.name)) {
          if (expr.name === "interface") {
            return this.tsParseInterface(node);
          } else if (expr.name === "type") {
            return this.tsParseTypeAlias(node);
          }
        }
      }

      return inner.call(this, node, expr);
    };
  });

  // export type
  instance.extend("shouldParseExportDeclaration", function (inner) {
    return function () {
      return this.isContextual("type")
          || this.isContextual("interface")
          || inner.call(this);
    };
  });

  instance.extend("parseConditional", function (inner) {
    return function (expr, noIn, startPos, startLoc, refNeedsArrowPos) {
      // only do the expensive clone if there is a question mark
      // and if we come from inside parens
      if (refNeedsArrowPos && this.match(tt.question)) {
        const state = this.state.clone();
        try {
          return inner.call(this, expr, noIn, startPos, startLoc);
        } catch (err) {
          if (err instanceof SyntaxError) {
            this.state = state;
            refNeedsArrowPos.start = err.pos || this.state.start;
            return expr;
          } else {
            // istanbul ignore next: no such error is expected
            throw err;
          }
        }
      }

      return inner.call(this, expr, noIn, startPos, startLoc);
    };
  });

  instance.extend("parseParenItem", function (inner) {
    return function (node, startLoc, startPos) {
      node = inner.call(this, node, startLoc, startPos);
      if (this.eat(tt.question)) {
        node.optional = true;
      }

      if (this.match(tt.colon)) {
        const typeCastNode = this.startNodeAt(startLoc, startPos);
        typeCastNode.expression = node;
        typeCastNode.typeAnnotation = this.tsParseTypeAnnotation();

        return this.finishNode(typeCastNode, "TypeCastExpression");
      }

      return node;
    };
  });

  instance.extend("parseExport", function (inner) {
    return function (node) {
      node = inner.call(this, node);
      if (node.type === "ExportNamedDeclaration") {
        node.exportKind = node.exportKind || "value";
      }
      return node;
    };
  });

  instance.extend("parseExportDeclaration", function (inner) {
    return function (node) {
      if (this.isContextual("type")) {
        node.exportKind = "type";

        const declarationNode = this.startNode();
        this.next();

        if (this.match(tt.braceL)) {
          // export type { foo, bar };
          node.specifiers = this.parseExportSpecifiers();
          this.parseExportFrom(node);
          return null;
        } else {
          // export type Foo = Bar;
          return this.tsParseTypeAlias(declarationNode);
        }
      } else if (this.isContextual("interface")) {
        node.exportKind = "type";
        const declarationNode = this.startNode();
        this.next();
        return this.tsParseInterface(declarationNode);
      } else {
        return inner.call(this, node);
      }
    };
  });

  instance.extend("parseClassId", function (inner) {
    return function (node) {
      inner.apply(this, arguments);
      if (this.isRelational("<")) {
        node.typeParameters = this.tsParseTypeParameterDeclaration();
      }
    };
  });

  // don't consider `void` to be a keyword as then it'll use the void token type
  // and set startExpr
  instance.extend("isKeyword", function (inner) {
    return function (name) {
      if (this.state.inType && name === "void") {
        return false;
      } else {
        return inner.call(this, name);
      }
    };
  });

  // ensure that inside ts types, we bypass the jsx parser plugin
  instance.extend("readToken", function (inner) {
    return function (code) {
      if (this.state.inType && (code === 62 || code === 60)) {
        return this.finishOp(tt.relational, 1);
      } else {
        return inner.call(this, code);
      }
    };
  });

  // don't lex any token as a jsx one inside a ts type
  instance.extend("jsx_readToken", function (inner) {
    return function () {
      if (!this.state.inType) return inner.call(this);
    };
  });

  instance.extend("toAssignable", function (inner) {
    return function (node, isBinding, contextDescription) {
      if (node.type === "TypeCastExpression") {
        return inner.call(this, this.typeCastToParameter(node), isBinding, contextDescription);
      } else {
        return inner.call(this, node, isBinding, contextDescription);
      }
    };
  });

  // turn type casts that we found in function parameter head into type annotated params
  instance.extend("toAssignableList", function (inner) {
    return function (exprList, isBinding, contextDescription) {
      for (let i = 0; i < exprList.length; i++) {
        const expr = exprList[i];
        if (expr && expr.type === "TypeCastExpression") {
          exprList[i] = this.typeCastToParameter(expr);
        }
      }
      return inner.call(this, exprList, isBinding, contextDescription);
    };
  });

  // this is a list of nodes, from something like a call expression, we need to filter the
  // type casts that we've found that are illegal in this context
  instance.extend("toReferencedList", function () {
    return function (exprList) {
      for (let i = 0; i < exprList.length; i++) {
        const expr = exprList[i];
        if (expr && expr._exprListItem && expr.type === "TypeCastExpression") {
          this.raise(expr.start, "Unexpected type cast");
        }
      }

      return exprList;
    };
  });

  // parse an item inside a expression list eg. `(NODE, NODE)` where NODE represents
  // the position where this function is called
  instance.extend("parseExprListItem", function (inner) {
    return function (allowEmpty, refShorthandDefaultPos) {
      const container = this.startNode();
      const node = inner.call(this, allowEmpty, refShorthandDefaultPos);
      if (this.match(tt.colon)) {
        container._exprListItem = true;
        container.expression = node;
        container.typeAnnotation = this.tsParseTypeAnnotation();
        return this.finishNode(container, "TypeCastExpression");
      } else {
        return node;
      }
    };
  });

  instance.extend("checkLVal", function (inner) {
    return function (node) {
      if (node.type !== "TypeCastExpression") {
        return inner.apply(this, arguments);
      }
    };
  });

  // parse class property type annotations
  instance.extend("parseClassProperty", function (inner) {
    return function (node) {
      delete node.variancePos;
      if (this.match(tt.colon)) {
        node.typeAnnotation = this.tsParseTypeAnnotation();
      }
      return inner.call(this, node);
    };
  });

  // determine whether or not we're currently in the position where a class property would appear
  instance.extend("isClassProperty", function (inner) {
    return function () {
      return this.match(tt.colon) || inner.call(this);
    };
  });

  // parse type parameters for class methods
  instance.extend("parseClassMethod", function () {
    return function (classBody, method, isGenerator, isAsync) {
      if (method.variance) {
        this.unexpected(method.variancePos);
      }
      delete method.variance;
      delete method.variancePos;
      if (this.isRelational("<")) {
        method.typeParameters = this.tsParseTypeParameterDeclaration();
      }
      this.parseMethod(method, isGenerator, isAsync);
      classBody.body.push(this.finishNode(method, "ClassMethod"));
    };
  });

  // parse a the super class type parameters and implements
  instance.extend("parseClassSuper", function (inner) {
    return function (node, isStatement) {
      inner.call(this, node, isStatement);
      if (node.superClass && this.isRelational("<")) {
        node.superTypeParameters = this.tsParseTypeParameterInstantiation();
      }
      if (this.isContextual("implements")) {
        this.next();
        const implemented = node.implements = [];
        do {
          const node = this.startNode();
          node.id = this.parseIdentifier();
          if (this.isRelational("<")) {
              node.typeParameters = this.tsParseTypeParameterInstantiation();
          } else {
              node.typeParameters = null;
          }
          implemented.push(this.finishNode(node, "ClassImplements"));
        } while (this.eat(tt.comma));
      }
    };
  });

  instance.extend("parsePropertyName", function (inner) {
    return function (node) {
      const variancePos = this.state.start;
      const variance = this.tsParseVariance();
      const key = inner.call(this, node);
      node.variance = variance;
      node.variancePos = variancePos;
      return key;
    };
  });

  // parse type parameters for object method shorthand
  instance.extend("parseObjPropValue", function (inner) {
    return function (prop) {
      if (prop.variance) {
        this.unexpected(prop.variancePos);
      }
      delete prop.variance;
      delete prop.variancePos;

      let typeParameters;

      // method shorthand
      if (this.isRelational("<")) {
        typeParameters = this.tsParseTypeParameterDeclaration();
        if (!this.match(tt.parenL)) this.unexpected();
      }

      inner.apply(this, arguments);

      // add typeParameters if we found them
      if (typeParameters) {
        (prop.value || prop).typeParameters = typeParameters;
      }
    };
  });

  instance.extend("parseAssignableListItemTypes", function () {
    return function (param) {
      if (this.eat(tt.question)) {
        param.optional = true;
      }
      if (this.match(tt.colon)) {
        param.typeAnnotation = this.tsParseTypeAnnotation();
      }
      this.finishNode(param, param.type);
      return param;
    };
  });

  instance.extend("parseMaybeDefault", function (inner) {
    return function (...args) {
      const node = inner.apply(this, args);

      if (node.type === "AssignmentPattern" && node.typeAnnotation && node.right.start < node.typeAnnotation.start) {
        this.raise(node.typeAnnotation.start, "Type annotations must come before default assignments, e.g. instead of `age = 25: number` use `age: number = 25`");
      }

      return node;
    };
  });


  // parse typeof and type imports
  instance.extend("parseImportSpecifiers", function (inner) {
    return function (node) {
      node.importKind = "value";

      let kind = null;
      if (this.match(tt._typeof)) {
        kind = "typeof";
      } else if (this.isContextual("type")) {
        kind = "type";
      }
      if (kind) {
        const lh = this.lookahead();
        if ((lh.type === tt.name && lh.value !== "from") || lh.type === tt.braceL || lh.type === tt.star) {
          this.next();
          node.importKind = kind;
        }
      }

      inner.call(this, node);
    };
  });

  // parse import-type/typeof shorthand
  instance.extend("parseImportSpecifier", function () {
    return function (node) {
      const specifier = this.startNode();
      const firstIdentLoc = this.state.start;
      const firstIdent = this.parseIdentifier(true);

      let specifierTypeKind = null;
      if (firstIdent.name === "type") {
        specifierTypeKind = "type";
      } else if (firstIdent.name === "typeof") {
        specifierTypeKind = "typeof";
      }

      if (this.isContextual("as")) {
        const as_ident = this.parseIdentifier(true);
        if (specifierTypeKind !== null && !this.match(tt.name)) {
          // `import {type as ,` or `import {type as }`
          specifier.imported = as_ident;
          specifier.importKind = specifierTypeKind;
          specifier.local = as_ident.__clone();
        } else {
          // `import {type as foo`
          specifier.imported = firstIdent;
          specifier.importKind = null;
          specifier.local = this.parseIdentifier(false);
        }
      } else if (specifierTypeKind !== null && this.match(tt.name)) {
        // `import {type foo`
        specifier.imported = this.parseIdentifier(true);
        specifier.importKind = specifierTypeKind;
        specifier.local =
          this.eatContextual("as")
          ? this.parseIdentifier(false)
          : specifier.imported.__clone();
      } else {
        if (firstIdent.name === "typeof") {
          this.unexpected(
            firstIdentLoc,
            "Cannot import a variable named `typeof`"
          );
        }
        specifier.imported = firstIdent;
        specifier.importKind = null;
        specifier.local = specifier.imported.__clone();
      }

      this.checkLVal(specifier.local, true, undefined, "import specifier");
      node.specifiers.push(this.finishNode(specifier, "ImportSpecifier"));
    };
  });

  // parse function type parameters - function foo<T>() {}
  instance.extend("parseFunctionParams", function (inner) {
    return function (node) {
      if (this.isRelational("<")) {
        node.typeParameters = this.tsParseTypeParameterDeclaration();
      }
      inner.call(this, node);
    };
  });

  // parse ts type annotations on variable declarator heads - let foo: string = bar
  instance.extend("parseVarHead", function (inner) {
    return function (decl) {
      inner.call(this, decl);
      if (this.match(tt.colon)) {
        decl.id.typeAnnotation = this.tsParseTypeAnnotation();
        this.finishNode(decl.id, decl.id.type);
      }
    };
  });

  // parse the return type of an async arrow function - let foo = (async (): number => {});
  instance.extend("parseAsyncArrowFromCallExpression", function (inner) {
    return function (node, call) {
      if (this.match(tt.colon)) {
        const oldNoAnonFunctionType = this.state.noAnonFunctionType;
        this.state.noAnonFunctionType = true;
        node.returnType = this.tsParseTypeAnnotation();
        this.state.noAnonFunctionType = oldNoAnonFunctionType;
      }

      return inner.call(this, node, call);
    };
  });

  // todo description
  instance.extend("shouldParseAsyncArrow", function (inner) {
    return function () {
      return this.match(tt.colon) || inner.call(this);
    };
  });

  // We need to support type parameter declarations for arrow functions. This
  // is tricky. There are three situations we need to handle
  //
  // 1. This is either JSX or an arrow function. We'll try JSX first. If that
  //    fails, we'll try an arrow function. If that fails, we'll throw the JSX
  //    error.
  // 2. This is an arrow function. We'll parse the type parameter declaration,
  //    parse the rest, make sure the rest is an arrow function, and go from
  //    there
  // 3. This is neither. Just call the inner function
  instance.extend("parseMaybeAssign", function (inner) {
    return function (...args) {
      let jsxError = null;
      if (tt.jsxTagStart && this.match(tt.jsxTagStart)) {
        const state = this.state.clone();
        try {
          return inner.apply(this, args);
        } catch (err) {
          if (err instanceof SyntaxError) {
            this.state = state;
            jsxError = err;
          } else {
            // istanbul ignore next: no such error is expected
            throw err;
          }
        }
      }

      // Need to push something onto the context to stop
      // the JSX plugin from messing with the tokens
      this.state.context.push(ct.parenExpression);
      if (jsxError != null || this.isRelational("<")) {
        let arrowExpression;
        let typeParameters;
        try {
          typeParameters = this.tsParseTypeParameterDeclaration();

          arrowExpression = inner.apply(this, args);
          arrowExpression.typeParameters = typeParameters;
          arrowExpression.start = typeParameters.start;
          arrowExpression.loc.start = typeParameters.loc.start;
        } catch (err) {
          throw jsxError || err;
        }

        if (arrowExpression.type === "ArrowFunctionExpression") {
          return arrowExpression;
        } else if (jsxError != null) {
          throw jsxError;
        } else {
          this.raise(
            typeParameters.start,
            "Expected an arrow function after this type parameter declaration",
          );
        }
      }
      this.state.context.pop();

      return inner.apply(this, args);
    };
  });

  // handle return types for arrow functions
  instance.extend("parseArrow", function (inner) {
    return function (node) {
      if (this.match(tt.colon)) {
        const state = this.state.clone();
        try {
          const oldNoAnonFunctionType = this.state.noAnonFunctionType;
          this.state.noAnonFunctionType = true;
          const returnType = this.tsParseTypeAnnotation();
          this.state.noAnonFunctionType = oldNoAnonFunctionType;

          if (this.canInsertSemicolon()) this.unexpected();
          if (!this.match(tt.arrow)) this.unexpected();
          // assign after it is clear it is an arrow
          node.returnType = returnType;
        } catch (err) {
          if (err instanceof SyntaxError) {
            this.state = state;
          } else {
            // istanbul ignore next: no such error is expected
            throw err;
          }
        }
      }

      return inner.call(this, node);
    };
  });

  instance.extend("shouldParseArrow", function (inner) {
    return function () {
      return this.match(tt.colon) || inner.call(this);
    };
  });

  instance.extend("isClassMutatorStarter", function (inner) {
    return function () {
      if (this.isRelational("<")) {
        return true;
      } else {
        return inner.call(this);
      }
    };
  });
}
