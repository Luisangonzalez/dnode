var EventEmitter = require('events').EventEmitter;
var Scrubber = require('dnode/scrubber').Scrubber;
var BufferList = require('bufferlist').BufferList;
var Buffer = require('buffer').Buffer;
var sys = require('sys');

exports.Conn = Conn;
Conn.prototype = new EventEmitter;
function Conn (args) {
    var self = this;
    
    var sock = args.stream;
    var remote = {};
    
    var scrubber = new Scrubber;
    
    // share an object or a function that builds an object
    var instance = typeof(args.wrapper) == 'function'
        ? new args.wrapper(remote)
        : args.wrapper
    ;
    
    var bufferList = new BufferList;
    sock.addListener('data', function (buf) {
        if (buf instanceof Buffer) {
            bufferList.push(buf);
            var n = buf.toString().indexOf('\n');
            while (n >= 0) {
                var i = bufferList.length - (buf.length - n);
                var line = bufferList.take(i); // up to the \n
                bufferList.advance(i + 1); // past the \n
                
                var msg = JSON.parse(line);
                handleRequest(msg);
                n = buf.toString().indexOf('\n', n + 1);
            }
        }
        else if (typeof(buf) == 'string') {
            // SocketIO wrapper sends strings
            var msg = JSON.parse(buf);
            handleRequest(msg);
        }
    });
    
    sock.addListener('connect', function () {
        sendRequest('methods', Object.keys(instance));
    });
    
    function sendRequest (method, args) {
        var scrub = scrubber.scrub(args);
        sock.write(JSON.stringify({
            method : method,
            arguments : scrub.arguments,
            callbacks : scrub.callbacks,
        }) + '\n');
    };
    
    function handleRequest(req) {
        var args = scrubber.unscrub(req);
        
        if (req.method == 'methods') {
            self.emit('methods', args);
            args.forEach(function (method) {
                remote[method] = function () {
                    var argv = [].concat.apply([],arguments);
                    sendRequest(method, argv);
                };
            });
            self.emit('remote', remote);
        }
        else if (typeof(req.method) == 'string') {
            instance[req.method].apply(instance,args);
        }
        else if (typeof(req.method) == 'number') {
            scrubber.callbacks[req.method].apply(instance,args);
        }
    }
};
