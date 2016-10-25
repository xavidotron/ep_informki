
function isInform() {
  return /\.ni(?:$|\?)/.exec(location.href);
}

exports.aceEditorCSS = function (hook_name, context) {
  if (isInform()) {
    return ["ep_informki/static/css/editor.css"];
  } else {
    return [];
  }
}

// Modified from the linestylefilter one to not append a colon and the match 
// after the tag (class).
// Should either have no capturing groups or three contiguous left-justified,
// where the first and third get the class tag.
function getRegexpFilter(linestylefilter, regExp, tag, beforetag)
{
  return function(lineText, textAndClassFunc)
  {
    regExp.lastIndex = 0;
    var regExpMatchs = null;
    var splitPoints = null;
    var execResult;
    while ((execResult = regExp.exec(lineText)))
    {
      if (!regExpMatchs)
      {
        regExpMatchs = [];
        splitPoints = [];
      }
      var startIndex = execResult.index;
      if (execResult.length == 1) {
        var regExpMatch = execResult[0];
        regExpMatchs.push([startIndex, regExpMatch]);
        splitPoints.push(startIndex, startIndex + regExpMatch.length);
      } else {
        regExpMatchs.push([startIndex, execResult[1]]);
        splitPoints.push(startIndex, startIndex + execResult[1].length);
        var threeStart = startIndex + execResult[1].length
          + execResult[2].length;
        regExpMatchs.push([threeStart, execResult[3]]);
        splitPoints.push(threeStart, threeStart + execResult[3].length);
      }
    }

    if (!regExpMatchs) return textAndClassFunc;

    function regExpMatchForIndex(idx)
    {
      for (var k = 0; k < regExpMatchs.length; k++)
      {
        var u = regExpMatchs[k];
        if (idx >= u[0] && idx < u[0] + u[1].length)
        {
          return u[1];
        }
      }
      return false;
    }

    var handleRegExpMatchsAfterSplit = (function()
    {
      var curIndex = 0;
      var before = true;
      return function(txt, cls)
      {
        var txtlen = txt.length;
        var newCls = cls;
        var regExpMatch = regExpMatchForIndex(curIndex);
        if (regExpMatch)
        {
          newCls += " " + tag;
          before = false;
        } else if (before && beforetag) {
          newCls += " " + beforetag;
        }
        textAndClassFunc(txt, newCls);
        curIndex += txtlen;
      };
    })();

    return linestylefilter.textAndClassFuncSplitter(handleRegExpMatchsAfterSplit, splitPoints);
  };
};

exports.aceGetFilterStack = function (hook_name, context) {
  if (!isInform()) return [];
  return [
    getRegexpFilter(context.linestylefilter, 
                    /"/g, 'quotemark', 'beforequotemark'),
    getRegexpFilter(context.linestylefilter, /\t/g, 'tab'),
    getRegexpFilter(context.linestylefilter, /"[^"]*"/g, 'string'),
    getRegexpFilter(context.linestylefilter, /\[[^\[\]]*\]/g, 'bracketed'),
    getRegexpFilter(context.linestylefilter, 
                    /^(?:Volume|Book|Part|Chapter|Section) .+$/g, 'section'),
    getRegexpFilter(context.linestylefilter, 
                    /^Table of .+$/g, 'tablestart'),
    getRegexpFilter(context.linestylefilter, 
                    /\b(?:is usually|is a kind of|is an action applying to|can be|are usually|matches the regular expression|relates|is not listed in|is|not|as a mistake|as something new|as|carry out|report|check|after|before|instead of|instead|first|last|definition:|to decide whether|at the time when|understand the command|understand|use|say|now|try|abide by|rule fails|rule succeeds|persuasion fails|persuasion succeeds|end the story(?: finally)?(?: saying)?|if|else|otherwise|repeat with|running through|include|that varies|when|\(with nouns reversed\))(?:(?=[ .;:])|$)/gi, 'keyword'),
    getRegexpFilter(context.linestylefilter, 
                    /^(?:to|release|index map with|rule for supplying a missing noun while)\b/gi, 'keyword'),
    getRegexpFilter(context.linestylefilter,
                    /^(test)( [^ ]+ )(with)/gi, 'keyword'),
    getRegexpFilter(context.linestylefilter,
                    /\b(let)( [^ ]+ )(be)/gi, 'keyword'),
    getRegexpFilter(context.linestylefilter,
                    /\b(remove)( .+ )(from play)/gi, 'keyword'),
  ];
}

function hasClass(node, cls) {
  return node.classList.contains(cls);
}
function highlightLine(node, skip_toc) {
  var prev = node.previousElementSibling;
  if (!skip_toc && node.querySelector('.section')) {
    var text = node.innerText;
    top.document.getElementById('toc').innerHTML
      += '<a href="scroll:' + node.id + '" class="toc' + text.split(' ', 1)[0]
      + '" onclick="tocScroll(\'' + node.id + '\'); return false">'
      + text + '</a><br>';
  }

  node.className = /\bace-line\b/.exec(node.className) ? 'ace-line' : '';
  var has_quote = node.querySelector('.quotemark:not(.string)');
  if (has_quote) {
    if (prev && (hasClass(prev, 'startquote') || hasClass(prev, 'contquote'))) {
      node.className += ' endquote';
      // Skip line ending check because we're in a quote.
      return;
    } else {
      node.className += ' startquote';
    }
  } else if (prev && (hasClass(prev, 'startquote')
                      || hasClass(prev, 'contquote'))) {
    var should_end_early = node.querySelector('.section, .string');
    if (should_end_early) {
      prev.className += ' err';
    } else {
      node.className += ' contquote';
    }
    // Skip line ending check because we're in a quote.
    return;
  }

  // Table stuff
  var has_text = node.innerText.trim();
  if (has_text && ((prev && hasClass(prev, 'table'))
                   || node.querySelector('.tablestart'))) {
    node.className += ' table';
    // Skip line ending check because tables are different.
    return;
  }

  // If we're not an empty node, check that our predecessor ended w/ :;.] or ."
  // If we're indented, it should be :;]
  if (prev && has_text && prev.innerText.trim()) {
    // An indented line's in an ul.
    if (node.firstChild.tagName == "ul") {
      if (!/[:;\]]\s*$/.exec(prev.innerText)) {
        prev.className += ' err';
      }
    } else {
      if (!/(?:[:;.\]]|\."|\.'")\s*$/.exec(prev.innerText)) {
        prev.className += ' err';
      }
    }
  }
}

var recolor_pending = false;
var edited_lines = [];
exports.aceEditEvent = function (hook_name, context) {
  if (!isInform()) return;

  if (context.callstack.docTextChanged) {
    console.log(context.callstack);
    var local_recolor = edited_lines.length > 0
      && context.callstack.type != 'setup'
      && context.callstack.type != 'setBaseText';
    if (local_recolor) {
      // If any of the edited lines are sections, do the global recolor to fix
      // the table of contents.
      for (var i = 0; i < edited_lines.length; ++i) {
        if (edited_lines[i].querySelector('.section')) {
          local_recolor = false;
          break;
        }
      }
    }
    if (local_recolor) {
      var touched_set = {};
      for (var i = 0; i < edited_lines.length; ++i) {
        var line = edited_lines[i];
        if (line.id in touched_set || !line.parentElement) {
          continue;
        }
        while (line) {
          touched_set[line.id] = true;
          var orig_class = line.className;
          highlightLine(line, true);
          if (orig_class == line.className && line != edited_lines[i]) {
            // If we didn't change the line's class, it won't impact future
            // lines. This doesn't apply for the first line, because edited
            // lines are reset.
            break;
          }
          line = line.nextElementSibling;
        }
      }
      console.log('local recolor with', edited_lines.length, 'edits touched',
                  Object.keys(touched_set).length, 'lines');
      edited_lines = [];
    } else if (!recolor_pending) {
      recolor_pending = true;
      setTimeout(function () {
        top.document.getElementById('toc').innerHTML = '';
        // Apply inter-line highlighting to everything.
        var line = context.editorInfo.frame.contentDocument
          .getElementsByTagName('iframe')[0].contentDocument.body
          .firstElementChild;
        while (line) {
          highlightLine(line);
          line = line.nextElementSibling;
        }

        recolor_pending = false;
      }, 1000);
    }
  }
}

exports.acePostWriteDomLineHTML = function (hook_name, context) {
  // If the element's already in the dom, this is some sort of repaint
  // and we don't care. If not, this is a new element for an edited line.
  if (!context.node.parentElement) {
    if (!recolor_pending) {
      edited_lines.push(context.node);
    }
  }
}

exports.aceKeyEvent = function (hook_name, context) {
  if (!isInform()) return;
  
  // If we're in a table, insert an actual tab when tab is pressed.
  var line = context.rep.selStart[0];
  if (context.evt.keyCode == 9
      && hasClass(context.rep.lines.atIndex(line).lineNode, 'table')) {
    if (context.evt.type == "keydown") {
      context.editorInfo.ace_replaceRange(
        context.rep.selStart, context.rep.selEnd, '\t');
    }
    context.evt.preventDefault();
    return true;
  }
}
