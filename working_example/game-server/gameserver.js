/* eslint-disable @typescript-eslint/no-var-requires */
const nodeDataChannel = require('node-datachannel');
const WebSocket = require('ws');
const readline = require('readline');
// .env vars
require("dotenv").config();

// Init Logger
nodeDataChannel.initLogger('Error');

// PeerConnection Map
const peerConnectionMap = {};

// DataChannel Map
const dataChannelMap = {};

// Local ID
const id = `server-${randomId(4)}`;

// Signaling Server
const WS_URL = process.env.WS_URL || 'ws://localhost:8081';
const ws = new WebSocket(WS_URL + '/' + id, {
    perMessageDeflate: false,
});

console.log(`The local ID is: ${id}`);
console.log(`Waiting for signaling to be connected...`);

ws.on('open', () => {
    console.log('WebSocket connected, signaling ready');
    readUserInput();
});

ws.on('error', (err) => {
    console.log('WebSocket Error: ', err);
});

ws.on('message', (msgStr) => {
    msg = JSON.parse(msgStr);
    switch (msg.type) {
        case 'offer':
            createPeerConnection(msg.id);
            peerConnectionMap[msg.id].setRemoteDescription(msg.description, msg.type);
            break;
        case 'answer':
            peerConnectionMap[msg.id].setRemoteDescription(msg.description, msg.type);
            break;
        case 'candidate':
            peerConnectionMap[msg.id].addRemoteCandidate(msg.candidate, msg.mid);
            break;

        default:
            break;
    }
});

function readUserInput() {
    // Read Line Interface
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('Enter a message to send to peers:\n', (message) => {
        if (message.length > 0) {
            sendToAllChannels(message);
        }
        rl.close();
        readUserInput();
    });
}

function sendToAllChannels(message) {
    Object.values(dataChannelMap).forEach(dc => {
        dc.sendMessage(message);
    });
    console.log(`Sent to ${Object.entries(dataChannelMap).length} peers`);
}

function createPeerConnection(peerId) {
    // Create PeerConnection
    let peerConnection = new nodeDataChannel.PeerConnection('pc', { iceServers: ['stun:stun.l.google.com:19302'] });
    peerConnection.onStateChange((state) => {
        console.log('State: ', state);
    });
    peerConnection.onGatheringStateChange((state) => {
        console.log('GatheringState: ', state);
    });
    peerConnection.onLocalDescription((description, type) => {
        console.log("testing");
        ws.send(JSON.stringify({ id: peerId, type, description }));
    });
    peerConnection.onLocalCandidate((candidate, mid) => {
        ws.send(JSON.stringify({ id: peerId, type: 'candidate', candidate, mid }));
    });
    peerConnection.onDataChannel((dc) => {
        console.log('DataChannel from ' + peerId + ' received with label "', dc.getLabel() + '"');
        dc.onMessage((msg) => {
            console.log('Message from ' + peerId + ' received:', msg);
        });
        dc.sendMessage('Hello From ' + id);

        dataChannelMap[peerId] = dc;
    });

    peerConnectionMap[peerId] = peerConnection;
}

function randomId(length) {
    var result = '';
    var characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}