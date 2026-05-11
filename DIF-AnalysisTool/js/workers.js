(function () {
  if (window.DIFWorkerPool) return;

  var PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js';

  function maxWorkers() {
    var ram = (navigator && navigator.deviceMemory) || 0;
    if (ram > 0 && ram <= 4) return 2;
    if (ram > 4) return 3;
    return 2;
  }

  function makeWorkerSrc(pythonCode) {
    return [
      "importScripts('" + PYODIDE_CDN + "');",
      'var _pyodide = null;',
      'var _ready = false;',
      'async function _init(code) {',
      '  _pyodide = await loadPyodide();',
      "  await _pyodide.loadPackage(['numpy', 'scipy']);",
      '  _pyodide.runPython(code);',
      '  _ready = true;',
      "  postMessage({ type: 'ready' });",
      '}',
      'onmessage = async function (e) {',
      '  var d = e.data;',
      "  if (d.type === 'init') { _init(d.code); return; }",
      "  if (d.type === 'run') {",
      '    if (!_ready) { postMessage({ type: \'error\', id: d.id, error: \'Worker not ready\' }); return; }',
      '    try {',
      "      _pyodide.globals.set('_payload_json', d.payload);",
      "      var result = _pyodide.runPython('analyze(_payload_json)');",
      "      postMessage({ type: 'result', id: d.id, result: result });",
      '    } catch (err) {',
      "      postMessage({ type: 'error', id: d.id, error: String(err) });",
      '    }',
      '  }',
      '};',
    ].join('\n');
  }

  function spawnWorker(pythonCode) {
    return new Promise(function (resolve, reject) {
      var src = makeWorkerSrc(pythonCode);
      var blob = new Blob([src], { type: 'application/javascript' });
      var url = URL.createObjectURL(blob);
      var w = new Worker(url);
      URL.revokeObjectURL(url);

      var timer = setTimeout(function () { reject(new Error('Worker init timeout')); }, 60000);

      w.addEventListener('message', function (e) {
        if (e.data.type === 'ready') { clearTimeout(timer); resolve(w); }
      });
      w.onerror = function (err) { clearTimeout(timer); reject(new Error(String(err.message || err))); };
      w.postMessage({ type: 'init', code: pythonCode });
    });
  }

  function Pool(pythonCode, n) {
    var self = this;
    self._code = pythonCode;
    self._n = n;
    self._workers = null;
    self._initPromise = null;
    self._callbacks = {};
    self._callId = 0;
    self._callWorker = {};

    self.init = function () {
      if (self._initPromise) return self._initPromise;
      self._initPromise = Promise.all(
        Array.from({ length: self._n }, function () { return spawnWorker(self._code); })
      ).then(function (ws) {
        self._workers = ws;
        ws.forEach(function (w, idx) {
          w.addEventListener('message', function (e) {
            var d = e.data;
            if (d.type === 'result' || d.type === 'error') {
              var cb = self._callbacks[d.id];
              if (!cb) return;
              delete self._callbacks[d.id];
              delete self._callWorker[d.id];
              if (d.type === 'result') cb.resolve(JSON.parse(d.result));
              else cb.reject(new Error(d.error));
            }
          });
          w.onerror = function (err) {
            Object.keys(self._callWorker).forEach(function (id) {
              if (self._callWorker[id] === idx) {
                var cb = self._callbacks[id];
                if (cb) {
                  delete self._callbacks[id];
                  delete self._callWorker[id];
                  cb.reject(new Error('Worker crashed: ' + (err.message || String(err))));
                }
              }
            });
          };
        });
        return ws;
      });
      self._initPromise.catch(function () { self._initPromise = null; self._workers = null; });
      return self._initPromise;
    };

    self.dispatch = function (workerIdx, payload) {
      return self.init().then(function (ws) {
        var wIdx = workerIdx % ws.length;
        var w = ws[wIdx];
        return new Promise(function (resolve, reject) {
          var id = ++self._callId;
          self._callbacks[id] = { resolve: resolve, reject: reject };
          self._callWorker[id] = wIdx;
          w.postMessage({ type: 'run', id: id, payload: JSON.stringify(payload) });
        });
      });
    };

    self.terminate = function () {
      if (self._workers) self._workers.forEach(function (w) { w.terminate(); });
      Object.keys(self._callbacks).forEach(function (id) {
        var cb = self._callbacks[id];
        if (cb) cb.reject(new Error('cancelled'));
      });
      self._callbacks = {};
      self._callWorker = {};
      self._workers = null;
      self._initPromise = null;
    };
  }

  var _mhPool = null;
  var _tswPool = null;

  function getMHPool(pythonCode) {
    if (!_mhPool) _mhPool = new Pool(pythonCode, 1);
    return _mhPool;
  }

  function getTSWPool(pythonCode, nDims) {
    var cap = Math.min(nDims, maxWorkers());
    if (_tswPool && _tswPool._n === cap) return _tswPool;
    if (_tswPool) _tswPool.terminate();
    _tswPool = new Pool(pythonCode, cap);
    return _tswPool;
  }

  function terminateAll() {
    if (_mhPool) { _mhPool.terminate(); _mhPool = null; }
    if (_tswPool) { _tswPool.terminate(); _tswPool = null; }
  }

  window.DIFWorkerPool = { getMHPool: getMHPool, getTSWPool: getTSWPool, terminateAll: terminateAll, maxWorkers: maxWorkers };
})();
