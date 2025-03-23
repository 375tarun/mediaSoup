import io from 'socket.io-client';
import { Device } from 'mediasoup-client';

const socket = io('/mediasoup');

socket.on('connection-success', ({ socketId }) => {
  console.log(`Socket connected: ${socketId}`);
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
  alert('Failed to connect to the server.');
});

let device;
let rtpCapabilities;
let producerTransport;
let consumerTransport;
let producer;
let consumer;

let params = {
  encodings: [
    { rid: 'r0', maxBitrate: 100000, scalabilityMode: 'S1T3' },
    { rid: 'r1', maxBitrate: 300000, scalabilityMode: 'S1T3' },
    { rid: 'r2', maxBitrate: 900000, scalabilityMode: 'S1T3' },
  ],
  codecOptions: { videoGoogleStartBitrate: 1000 },
};

const streamSuccess = async (stream) => {
  localVideo.srcObject = stream;
  const track = stream.getVideoTracks()[0];
  params = { track, ...params };
};

const getLocalStream = () => {
  navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: { width: { min: 640, max: 1920 }, height: { min: 400, max: 1080 } },
    })
    .then(streamSuccess)
    .catch((error) => {
      console.error('Error getting local stream:', error);
      alert('Failed to get local video stream.');
    });
};

const createDevice = async () => {
  try {
    device = new Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
    console.log('RTP Capabilities:', device.rtpCapabilities);
  } catch (error) {
    console.error('Error creating device:', error);
    if (error.name === 'UnsupportedError') {
      alert('Browser not supported for mediasoup.');
    } else {
      alert('Failed to create mediasoup device.');
    }
  }
};

const getRtpCapabilities = () => {
  socket.emit('getRtpCapabilities', (data) => {
    if (data.error) {
      console.error('Error getting RTP capabilities:', data.error);
      alert('Failed to get RTP capabilities from the server.');
      return;
    }
    console.log('Router RTP Capabilities:', data.rtpCapabilities);
    rtpCapabilities = data.rtpCapabilities;
  });
};

const createSendTransport = () => {
  socket.emit('createWebRtcTransport', { sender: true }, ({ params }) => {
    if (params.error) {
      console.error('Error creating send transport:', params.error);
      alert('Failed to create send transport.');
      return;
    }
    console.log('Send transport params:', params);
    producerTransport = device.createSendTransport(params);

    producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await socket.emit('transport-connect', { dtlsParameters });
        callback();
      } catch (error) {
        console.error('Transport connect error:', error);
        errback(error);
        alert('Transport connect failed.');
      }
    });

    producerTransport.on('produce', async (parameters, callback, errback) => {
      try {
        await socket.emit('transport-produce', { kind: parameters.kind, rtpParameters: parameters.rtpParameters, appData: parameters.appData }, ({ id }) => {
          callback({ id });
        });
      } catch (error) {
        console.error('Transport produce error:', error);
        errback(error);
        alert('Transport produce failed.');
      }
    });
  });
};

const connectSendTransport = async () => {
  try {
    producer = await producerTransport.produce(params);

    producer.on('trackended', () => {
      console.log('Track ended');
    });

    producer.on('transportclose', () => {
      console.log('Transport ended');
    });
  } catch (error) {
    console.error("error producing:", error);
    alert("failed to produce the local stream");
  }
};

const createRecvTransport = async () => {
  socket.emit('createWebRtcTransport', { sender: false }, ({ params }) => {
    if (params.error) {
      console.error('Error creating receive transport:', params.error);
      alert('Failed to create receive transport.');
      return;
    }
    console.log('Receive transport params:', params);
    consumerTransport = device.createRecvTransport(params);

    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await socket.emit('transport-recv-connect', { dtlsParameters });
        callback();
      } catch (error) {
        console.error('Receive transport connect error:', error);
        errback(error);
        alert('Receive transport connect failed.');
      }
    });
  });
};

const connectRecvTransport = async () => {
  socket.emit('consume', { rtpCapabilities: device.rtpCapabilities }, async ({ params }) => {
    if (params.error) {
      console.error('Cannot consume:', params.error);
      alert('Failed to consume remote stream.');
      return;
    }
    console.log('Consumer params:', params);
    try {
      consumer = await consumerTransport.consume({
        id: params.id,
        producerId: params.producerId,
        kind: params.kind,
        rtpParameters: params.rtpParameters,
      });

      const { track } = consumer;
      console.log("Track kind: ", track.kind);
      console.log("Track readyState: ", track.readyState);
      track.onmute = () => console.log("Track muted");
      track.onunmute = () => console.log("Track unmuted");
      track.onended = () => console.log("Track ended");
      remoteVideo.srcObject = new MediaStream([track]);
      remoteVideo.play().catch(e => console.error("remoteVideo.play() failed", e));

      socket.emit('consumer-resume');
    } catch (error) {
      console.error("error consuming:", error);
      alert("failed to consume the remote stream");
    }
  });
};

btnLocalVideo.addEventListener('click', getLocalStream);
btnRtpCapabilities.addEventListener('click', getRtpCapabilities);
btnDevice.addEventListener('click', createDevice);
btnCreateSendTransport.addEventListener('click', createSendTransport);
btnConnectSendTransport.addEventListener('click', connectSendTransport);
btnRecvSendTransport.addEventListener('click', createRecvTransport);
btnConnectRecvTransport.addEventListener('click', connectRecvTransport);