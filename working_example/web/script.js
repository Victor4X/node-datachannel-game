/*
 * libdatachannel example web client
 * Copyright (C) 2020 Lara Mackey
 * Copyright (C) 2020 Paul-Louis Ageneau
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; If not, see <http://www.gnu.org/licenses/>.
 */

window.onload = (() => {

    const connectBtn = document.getElementById('connectBtn');

    connectBtn.onclick = ('click', () => {

        const urlInput = document.getElementById('urlInput');
        const portInput = document.getElementById('portInput');


        const baseUrl = urlInput.value + ':' + portInput.value;

        if (baseUrl.length < 5) {
            return;
        }

        const config = {
            iceServers: [{
                urls: 'stun:stun.l.google.com:19302', // change to your STUN server
            }],
        };

        const localId = randomId(4);
        const url = `ws://${baseUrl}/${localId}`;

        const peerConnectionMap = {};
        const dataChannelMap = {};

        const peerList = document.getElementById('peerList');
        const publicList = document.getElementById('publicList');
        const publicRefreshBtn = document.getElementById('publicRefreshBtn');
        const messageArea = document.getElementById('messageArea');

        const offerId = document.getElementById('offerId');
        const offerBtn = document.getElementById('offerBtn');

        const sendMsg = document.getElementById('sendMsg');
        const sendBtn = document.getElementById('sendBtn');

        const sendWhisperMsg = document.getElementById('sendWhisperMsg');
        const sendWhisperPeer = document.getElementById('sendWhisperPeer');
        const sendWhisperBtn = document.getElementById('sendWhisperBtn');

        const _localId = document.getElementById('localId');
        _localId.textContent = localId;

        console.log('Connecting to signaling...');
        openSignaling(url)
            .then((ws) => {
                console.log('WebSocket connected, signaling ready');
                urlInput.disabled = true;
                portInput.disabled = true;
                connectBtn.disabled = true;
                offerId.disabled = false;
                offerBtn.disabled = false;
                offerBtn.onclick = () => {
                    offerPeerConnection(ws, offerId.value);
                    offerId.value = null;
                };
                publicRefreshBtn.disabled = false;
                publicRefreshBtn.onclick = () => updatePubliclist();
                updatePubliclist();
            })
            .catch((err) => console.error(err));

        function openSignaling(url) {
            return new Promise((resolve, reject) => {
                const ws = new WebSocket(url);
                ws.onopen = () => resolve(ws);
                ws.onerror = () => reject(new Error('WebSocket error'));
                ws.onclose = () => console.error('WebSocket disconnected');
                ws.onmessage = (e) => {
                    if (typeof (e.data) != 'string')
                        return;
                    const message = JSON.parse(e.data);
                    console.log(message);
                    const { id, type } = message;

                    let pc = peerConnectionMap[id];
                    if (!pc) {
                        if (type != 'offer')
                            return;

                        // Create PeerConnection for answer
                        console.log(`Answering to ${id}`);
                        pc = createPeerConnection(ws, id);
                    }

                    switch (type) {
                        case 'offer':
                        case 'answer':
                            pc.setRemoteDescription({
                                sdp: message.description,
                                type: message.type,
                            }).then(() => {
                                if (type == 'offer') {
                                    // Send answer
                                    sendLocalDescription(ws, id, pc, 'answer');
                                }
                            });
                            break;

                        case 'candidate':
                            pc.addIceCandidate({
                                candidate: message.candidate,
                                sdpMid: message.mid,
                            });
                            break;
                    }
                }
            });
        }

        function offerPeerConnection(ws, id) {
            // Create PeerConnection
            console.log(`Offering to ${id}`);
            pc = createPeerConnection(ws, id);

            // Create DataChannel
            const label = "test";
            console.log(`Creating DataChannel with label "${label}"`);
            const dc = pc.createDataChannel(label);
            setupDataChannel(dc, id);

            // Send offer
            sendLocalDescription(ws, id, pc, 'offer');
        }

        // Create and setup a PeerConnection
        function createPeerConnection(ws, id) {
            const pc = new RTCPeerConnection(config);
            pc.oniceconnectionstatechange = () => console.log(`Connection state: ${pc.iceConnectionState}`);
            pc.onicegatheringstatechange = () => console.log(`Gathering state: ${pc.iceGatheringState}`);
            pc.onicecandidate = (e) => {
                if (e.candidate && e.candidate.candidate) {
                    // Send candidate
                    sendLocalCandidate(ws, id, e.candidate);
                }
            };
            pc.ondatachannel = (e) => {
                const dc = e.channel;
                console.log(`DataChannel from ${id} received with label "${dc.label}"`);
                appendMessage(`DataChannel from ${id} received with label "${dc.label}"`);
                setupDataChannel(dc, id);

                dc.send(`Hello from ${localId}`);
                // Show own message as well
                appendMessage(`Hello from ${localId}`, localId);
            };

            peerConnectionMap[id] = pc;
            return pc;
        }

        // Setup a DataChannel
        function setupDataChannel(dc, id) {
            dc.onopen = () => {
                console.log(`DataChannel from ${id} open`);
                updatePeerlist();

                sendMsg.disabled = false;
                sendBtn.disabled = false;
                sendBtn.onclick = () => sendToAllChannels(sendMsg.value);

                sendWhisperMsg.disabled = false;
                sendWhisperPeer.disabled = false;
                sendWhisperBtn.disabled = false;
                sendWhisperBtn.onclick = () => sendToPeer(sendWhisperMsg.value, sendWhisperPeer.value);
            };
            dc.onclose = () => {
                console.log(
                    `DataChannel from ${id} closed`);
                appendMessage(`DataChannel from ${id} closed`);
                delete dataChannelMap[id];
                updatePeerlist();
            };
            dc.onmessage = (e) => {
                if (typeof (e.data) != 'string')
                    return;
                console.log(`Message from ${id} received: ${e.data}`);
                appendMessage(e.data, id);
            };

            dataChannelMap[id] = dc;
            return dc;
        }

        function sendToAllChannels(message) {
            Object.values(dataChannelMap).forEach(dc => {
                dc.send(message);
            });
            // Show own message
            appendMessage(message, localId);
        }

        function sendToPeer(message, peerId) {
            if (dataChannelMap[peerId]) {
                dataChannelMap[peerId].send(message);
                appendMessage(message, `${localId}->${peerId}`);
            } else {
                appendMessage("Invalid peer")
            }
        }

        function updatePeerlist() {
            peerList.innerHTML = "";
            Object.keys(dataChannelMap).forEach(id => peerList.append(id + '\n'));
            updatePubliclist();
        }

        function updatePubliclist() {
            // Get list from server
            let xmlHttpReq = new XMLHttpRequest();
            xmlHttpReq.open("GET", `http://${baseUrl}/servers`, false);
            xmlHttpReq.send(null);
            let responseText = xmlHttpReq.responseText;
            let servers = JSON.parse(responseText);
            // Remove already connected
            publicList.innerHTML = "";
            Object.values(servers).forEach(id => {
                if (dataChannelMap[id] == null && localId != id) {
                    publicList.append(id + '\n');
                }
            });
        }

        function appendMessage(message, sender = "info") {
            messageArea.append(`[${sender}]: ${message}\n`);
        }

        function sendLocalDescription(ws, id, pc, type) {
            (type == 'offer' ? pc.createOffer() : pc.createAnswer())
                .then((desc) => pc.setLocalDescription(desc))
                .then(() => {
                    const { sdp, type } = pc.localDescription;
                    ws.send(JSON.stringify({
                        id,
                        type,
                        description: sdp,
                    }));
                });
        }

        function sendLocalCandidate(ws, id, cand) {
            const { candidate, sdpMid } = cand;
            ws.send(JSON.stringify({
                id,
                type: 'candidate',
                candidate,
                mid: sdpMid,
            }));
        }

        // Helper function to generate a random ID
        function randomId(length) {
            const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
            const pickRandom = () => characters.charAt(Math.floor(Math.random() * characters.length));
            return [...Array(length)].map(pickRandom).join('');
        }

    });
});