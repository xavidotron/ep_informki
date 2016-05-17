var fs = require('fs');
var queue = require("queue-async");
var exec = require('child_process').exec;
var execFile = require('child_process').execFile;
var spawn = require('child_process').spawn;
var endsWith = require("underscore.string/endsWith");

var serve = require("ep_bazki/serve");
var ERR = serve.ERR;
var util = require("ep_bazki/util");
var workdir = require("ep_bazki/workdir");

serve.registerExtension('.ni', 'inform');

serve.registerView('inform', function (project, path, info, res) {
  res.render("inform.ejs", {
    padid: info.groupid + '$' + util.path_to_padid(path),
  });
});

exports.expressCreateServer = function (hook_name, context, cb) {
  var views = context.app.get('views');
  if (typeof(views) == 'string') { views = [views]; }
  context.app.set('views', views.concat(__dirname + '/templates/'));
  
  serve.register_path_url(
    context.app, 'compile', function (project, path, info, res) {
      if (!endsWith(path, '/')) {
        res.redirect('/g/' + project + '/compile/' + path + '/');
        return;
      }

      workdir.sync(project, function (error) {
        if (error) { ERR(error, res, true); return; }
        var i7 = spawn('/usr/local/bin/i7', ['-c', path],
                       {'cwd': workdir.get_path(project)});
        res.write('<html><body><pre style="white-space: pre-wrap">');
        var done = false;
        var writeData = function (data) {
          if (!done) {
            data = data.toString();
            res.write(data);
          }
        };
        i7.stdout.on('data', writeData);
        i7.stderr.on('data', writeData);
        i7.on('exit', function (code, signal) {
          done = true;
          if (code || signal) {
            res.end('</pre><h2>Exited with '+ (code || signal)
                    + '</h2></body></html>');
          } else {
            var mod = path.replace('.inform', '.materials');
            res.end('</pre><script type="text/javascript">location.href = "/g/'
                    + project + '/w/' + mod
                    + 'Release/play.html";</script></body></html>');
          }
        });
      });
    });

  serve.register_path_url(
    context.app, 'w', function (project, path, info, res) {
      res.sendFile(workdir.get_path(project) + path);
    });

  // Filter inform: URLs to be /informdoc/ URLs
  serve.register_path_url(
    context.app, 'wf', function (project, path, info, res) {
      fs.readFile(
        workdir.get_path(project) + path, {encoding: 'utf-8'},
        function (error, data) {
          if (error) { ERR(error, res, true); return; }
          
          data = data.replace(/inform:\//g, '/informdoc/');
          data = data.replace(
              /(href="source:story\.ni#line(\d+)")/g,
            '$1 onclick="top.lineScroll($2); return false"');
          res.send(data);
        });
    });

  context.app.all('/informdoc/:path(*)', function (req, res) {
    var thunk = function (fpath) {
      fs.readFile(
        fpath, {encoding: 'utf-8'},
        function (error, data) {
          if (error) { ERR(error, res, true); return; }
          
          data = data.replace(/Documentation\/Images\//g, 'doc_images/');
          res.send(data);
        });
    };

    if (req.params.path.indexOf('..') != -1) {
      res.status(400).send('Invalid path!');
    } else if (!/\.(?:html|css)$/.exec(req.params.path)) {
      res.sendFile('/usr/local/share/inform7/Documentation/' + req.params.path);
    } else {
      var m = /doc(\d+).html/.exec(req.params.path);
      if (m) {
        exec(
          'ls -v /usr/local/share/inform7/Documentation/WI*.html',
          function (error, stdout, stderr) {
            if (error) { ERR(error); return; }
            var files = stdout.split('\n');
            thunk(files[parseInt(m[1]) - 1]);
          });
      } else {
        thunk('/usr/local/share/inform7/Documentation/' + req.params.path);
      }
    }
  });

  // /newinform
  serve.registerRepoCreator(context.app, '/newinform',
                            __dirname + "/bin/init-inform.sh");

  cb();
}
