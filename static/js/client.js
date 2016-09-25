exports.postAceInit = function (hook_name, context, cb) {
  parent.onDocumentReady(context.pad);
  cb();
}
