/**
 * This a minimal fully functional example for setting up a client written in JavaScript that
 * communicates with a server via WebRTC data channels. This uses WebSockets to perform the WebRTC
 * handshake (offer/accept SDP) with the server. We only use WebSockets for the initial handshake
 * because TCP often presents too much latency in the context of real-time action games. WebRTC
 * data channels, on the other hand, allow for unreliable and unordered message sending via SCTP
 *
 * Brian Ho
 * brian@brkho.com
 */

// URL to the server with the port we are using for WebSockets.
const WS_URL = 'ws://localhost:8081';
// The WebSocket object used to manage a connection.
let ws = null;

const pcMap = {};
let id = null;

// Callback for when the WebSocket is successfully opened.
function onWebSocketOpen() { 
    console.log('WebSocket connected, signaling ready');
    document.getElementById("ws-status").innerHTML = "WebSocket connected, signaling ready";
    document.getElementById("connect-button").disabled = true;
    document.getElementById("id-paragraph").innerHTML = "Your id is: " + id;
    document.getElementById("log-div").style = "";
}

// Callback for when we receive a message from the server via the WebSocket.
function onWebSocketMessage(event) {
    const msg = JSON.parse(event.data);
    switch (msg.type) {
        case 'offer':
            createPeerConnection(msg.id);
            pcMap[msg.id].setRemoteDescription(msg.description, msg.type);
            break;
        case 'answer':
            pcMap[msg.id].setRemoteDescription(msg.description, msg.type);
            break;
        case 'candidate':
            pcMap[msg.id].addRemoteCandidate(msg.candidate, msg.mid);
            break;

        default:
            break;
    }
}

function onWebSocketError(err) {
    console.log('WebSocket Error: ', err);
}

// Connects by creating a new WebSocket connection and associating some callbacks.
function connect() {
    id = randomId(4);
    ws = new WebSocket(WS_URL + '/' + id);
    ws.onopen = onWebSocketOpen;
    ws.onmessage = onWebSocketMessage;
    ws.onerror = onWebSocketError;
}

function addPeer() {
    let peerId = document.getElementById("peer-input").value;
    if (peerId.length < 4 || peerId.length > 10){
        logLine(peerId + " is an invalid id");
        return;
    } 
    logLine("Offering connection to: " + peerId);
    createPeerConnection(peerId);
    let dc = pcMap[peerId].createDataChannel('test');
    dc.onopen = (() => {
        dc.sendMessage('Hello from ' + id);
    });

    dc.onmessage = ((msg) => {
        console.log('Message from ' + peerId + ' received:', msg);
    });
}

function createPeerConnection(peerId){
    let peerConnection = new RTCPeerConnection({ iceServers: [{ url: 'stun:stun.l.google.com:19302' }] });
    peerConnection.onconnectionstatechange = ((state) => {
        logLine('State: ', state);
    });
    peerConnection.onicegatheringstatechange = ((state) => {
        logLine('GatheringState: ', state);
    });
    peerConnection.onicecandidate = ((candidate, mid) => {
        ws.send(JSON.stringify({ id: peerId, type: 'candidate', candidate, mid }));
    });
    peerConnection.ondatachannel = ((dc) => {
        logLine('DataChannel from ' + peerId + ' received with label "', dc.getLabel() + '"');
        dc.onMessage((msg) => {
            logLine('Message from ' + peerId + ' received:', msg);
        });
        dc.sendMessage('Hello From ' + id);
    });

    pcMap[peerId] = peerConnection;
    peerConnection.createOffer( ( 
            (description) => {
                peerConnection.setLocalDescription(description);
                ws.send(JSON.stringify({type: 'offer', payload: description}));
            }),
            () => {}
            );
}

function randomId(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function logLine(line) {
    console.log(line);
    document.getElementById("log-area").append(line + "\n");
}