// Build-only adaptation for pinned @techstark/opencv-js 4.10.0-release.1.
// Equivalent closure-based Emscripten bindings: no eval or Function constructor.
// Upgrades fail closed if the expected generated glue changes.
export function patchOpenCv(source) {
  const patches = [
    [/function createNamedFunction\(name,body\)\{.*?\}(?=function extendError)/s,
      'function createNamedFunction(name,body){var wrapped=function(){return body.apply(this,arguments)};Object.defineProperty(wrapped,"name",{value:makeLegalFunctionName(name)});return wrapped}'],
    [/function makeDynCaller\(dynCall\)\{.*?\}(?=var fp;)/s,
      'function makeDynCaller(dynCall){return function(){return dynCall.apply(null,[rawFunction].concat(Array.prototype.slice.call(arguments)))}}'],
    [/function craftInvokerFunction\(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc\)\{.*?\}(?=function heap32VectorToArray)/s,
      `function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){
        if(argTypes.length<2)throwBindingError("argTypes array size mismatch");
        var method=argTypes[1]!==null&&classType!==null;
        var stacked=argTypes.slice(1).some(function(t){return t!==null&&t.destructorFunction===undefined});
        var wrapped=function(){
          if(arguments.length!==argTypes.length-2)throwBindingError("function "+humanName+" called with an invalid number of arguments");
          var destructors=stacked?[]:null,wired=[],types=[];
          if(method){wired.push(argTypes[1].toWireType(destructors,this));types.push(argTypes[1])}
          for(var i=0;i<arguments.length;i++){wired.push(argTypes[i+2].toWireType(destructors,arguments[i]));types.push(argTypes[i+2])}
          var result=cppInvokerFunc.apply(null,[cppTargetFunc].concat(wired));
          if(stacked)runDestructors(destructors);else for(var i=0;i<types.length;i++)if(types[i].destructorFunction!==null)types[i].destructorFunction(wired[i]);
          if(argTypes[0].name!=="void")return argTypes[0].fromWireType(result);
        };
        Object.defineProperty(wrapped,"name",{value:makeLegalFunctionName(humanName)});
        Object.defineProperty(wrapped,"length",{value:argTypes.length-2});return wrapped;
      }`],
    [/function __emval_get_method_caller\(argCount,argTypes\)\{.*?\}(?=function __emval_get_property)/s,
      `function __emval_get_method_caller(argCount,argTypes){
        var types=__emval_lookupTypes(argCount,argTypes),ret=types[0];
        return __emval_addMethodCaller(function(handle,name,destructors,args){
          var values=[],offset=0;
          for(var i=1;i<types.length;i++){values.push(types[i].readValueFromPointer(args+offset));offset+=types[i].argPackAdvance}
          var result=handle[name].apply(handle,values);
          for(var i=1;i<types.length;i++)if(types[i].deleteObject)types[i].deleteObject(values[i-1]);
          if(!ret.isVoid)return ret.toWireType(destructors,result);
        });
      }`],
  ];
  if ((source.match(/new Function\(/g) ?? []).length !== 2 || (source.match(/new_\(Function,/g) ?? []).length !== 2) throw new Error('OpenCV dynamic binding count changed');
  let patched = source;
  for (const [pattern, replacement] of patches) {
    if (!pattern.test(patched)) throw new Error('OpenCV CSP patch no longer matches the pinned dependency');
    patched = patched.replace(pattern, replacement);
  }
  const binaryGuard = 'if(!wasmBinary&&(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER)&&typeof fetch==="function")';
  if (!patched.includes(binaryGuard)) throw new Error('OpenCV binary loader changed');
  patched = patched.replace(binaryGuard, 'if(!wasmBinary&&!isDataURI(wasmBinaryFile)&&(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER)&&typeof fetch==="function")');
  if (/new Function\(|new_\(Function,/.test(patched)) throw new Error('OpenCV still contains dynamic bindings');
  return patched;
}
