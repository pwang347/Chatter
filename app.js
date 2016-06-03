var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    mongoose = require('mongoose'),
    users = {},
    request = require('request'),
    cheerio = require('cheerio'),
    fs = require('fs'),
    SAY_LIMIT = 100,
    SAY_ENABLED = true,
    SAY_INTERRUPT = true;

var say = require('say');

server.listen(3000); // listens to port 3000

mongoose.connect('mongodb://localhost/chat', function (err) {
    if (err) {
        console.log(err);
    } else {
        console.log('Connected to MongoDB!');
    }
}); //db is created

var chatSchema = mongoose.Schema({
    nick: String,
    msg: String,
    created: {type: Date, default: Date.now()}
}); // can use javascript objects, eg. name: {first: String, last: String}

var Chat = mongoose.model('Message', chatSchema);

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

io.sockets.on('connection', function (socket) {
    var query = Chat.find({});
    query.sort('-created').exec(function (err, docs) {
        if (err) throw err;
        socket.emit('load old msgs', docs);
    });

    updateNicknames();

    socket.on('new user', function (data, callback) {
        if (data in users) {
            callback(false, "");
        } else {
            callback(true, data);
            socket.nickname = data;
            users[socket.nickname] = socket;
            updateNicknames();
            io.sockets.emit('alert', socket.nickname + " has entered the chat room.");
        }
    });

    function updateNicknames() {
        io.sockets.emit('usernames', Object.keys(users));
    }

    socket.on('send message', function (data, callback) {
        var str = data.trim();
        if (str.substr(0, 3) === '/w ') {
            str = str.substr(3);
            var ind = str.indexOf(' ');
            if (ind !== -1) {
                var name = str.substr(0, ind);
                var msg = str.substr(ind + 1);
                if (name in users && name != socket.nickname) {
                    users[name].emit('whisper', {msg: msg, nick: "["+socket.nickname +" to " +name+"]"});
                    users[socket.nickname].emit('whisper',{msg: msg, nick: "["+socket.nickname +" to " +name+"]"});
                } else {
                    callback("Error! Enter a valid user.");
                }
            } else {
                callback("Error! Please enter a msg for whisper.");
            }
        } else {
            var newMsg = new Chat({msg: str, nick: socket.nickname});
            newMsg.save(function (err) {
                if (err) throw err;
                io.sockets.emit('new message', {msg: data, nick: socket.nickname, created: Date.now()});
                playTTS((socket.nickname + " says: " + data));
            });
        }
    });

    socket.on('disconnect', function (data) {
        if (!socket.nickname) return;
        io.sockets.emit('alert', socket.nickname + " has quit the chat room.");
        delete users[socket.nickname];
        updateNicknames();
    });

    socket.on('stop say', function(){
       say.stop();
    });

    socket.on('toggle say', function(){
        say.stop();
        SAY_ENABLED = !SAY_ENABLED;
    });

    function playTTS(text){
        if(SAY_INTERRUPT){
            say.stop();
            setTimeout(function () {
                if (SAY_ENABLED) {
                    say.speak(text);
                }
            }, 100);
        }  else {
            say.speak(text);
        }
    }
});