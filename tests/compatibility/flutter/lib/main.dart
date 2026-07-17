import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:livekit_client/livekit_client.dart';

import 'yujian_rtc_compat.dart';

void main() {
  runApp(const YujianRtcCompatApp());
}

class YujianRtcCompatApp extends StatefulWidget {
  const YujianRtcCompatApp({super.key});

  @override
  State<YujianRtcCompatApp> createState() => _YujianRtcCompatAppState();
}

class _YujianRtcCompatAppState extends State<YujianRtcCompatApp> {
  YujianRtcPair? _pair;
  LocalAudioTrack? _localAudioTrack;
  EventsListener<RoomEvent>? _secondaryListener;
  String _status = '等待开始';
  bool _running = false;

  @override
  void initState() {
    super.initState();
    if (Uri.base.queryParameters['autorun'] == '1') {
      WidgetsBinding.instance.addPostFrameCallback((_) => _connect());
    }
  }

  Future<void> _connect() async {
    const dataTopic = 'yujian.flutter.compatibility';
    const rpcMethod = 'yujian.flutter.echo';
    var rpcRegistered = false;
    setState(() {
      _running = true;
      _status = '正在连接语见 RTC…';
    });
    try {
      final primary = await _requestToken('primary', 'flutter-primary');
      final secondary = await _requestToken('secondary', 'flutter-secondary');
      final pair = await connectYujianRtcPair(
        primaryUrl: primary['url'] as String,
        primaryToken: primary['token'] as String,
        secondaryUrl: secondary['url'] as String,
        secondaryToken: secondary['token'] as String,
      );
      _pair = pair;
      final listener = pair.secondary.createListener();
      _secondaryListener = listener;

      final dataReceived = listener.waitFor<DataReceivedEvent>(
        duration: const Duration(seconds: 15),
        filter: (event) =>
            event.participant?.identity == 'flutter-primary' &&
            event.topic == dataTopic,
      );
      await pair.primary.localParticipant!.publishData(
        utf8.encode('yujian-flutter-data'),
        reliable: true,
        topic: dataTopic,
      );
      final dataEvent = await dataReceived;
      if (utf8.decode(dataEvent.data) != 'yujian-flutter-data') {
        throw StateError('Flutter Data payload mismatch');
      }

      pair.secondary.registerRpcMethod(
        rpcMethod,
        (data) async => 'flutter:${data.payload}',
      );
      rpcRegistered = true;
      final rpcResponse = await pair.primary.localParticipant!.performRpc(
        PerformRpcParams(
          destinationIdentity: 'flutter-secondary',
          method: rpcMethod,
          payload: 'ready',
          responseTimeoutMs: const Duration(seconds: 8),
        ),
      );
      if (rpcResponse != 'flutter:ready') {
        throw StateError('Flutter RPC response mismatch');
      }

      final subscribed = listener.waitFor<TrackSubscribedEvent>(
        duration: const Duration(seconds: 15),
        filter: (event) =>
            event.participant.identity == 'flutter-primary' &&
            event.publication.source == TrackSource.microphone,
      );
      final localTrack = await LocalAudioTrack.create();
      _localAudioTrack = localTrack;
      await pair.primary.localParticipant!.publishAudioTrack(localTrack);
      final event = await subscribed;
      if (event.track is! RemoteAudioTrack) {
        throw StateError('Flutter remote Track was not an audio Track');
      }
      final remoteTrack = event.track as RemoteAudioTrack;
      num bytesReceived = 0;
      for (var attempt = 0; attempt < 10; attempt += 1) {
        await Future<void>.delayed(const Duration(milliseconds: 200));
        final stats = await remoteTrack.getReceiverStats();
        bytesReceived = stats?.bytesReceived ?? 0;
        if (bytesReceived > 0) break;
      }
      if (bytesReceived <= 0) {
        throw StateError('Flutter remote audio Track received no RTP bytes');
      }
      debugPrint(
        'YUJIAN_FLUTTER_COMPAT_PASSED data_rpc=passed bytes=$bytesReceived',
      );
      if (!mounted) return;
      setState(
        () => _status =
            '通过：双节点 Flutter Data/RPC/音频 Track（$bytesReceived bytes）',
      );
    } catch (error) {
      debugPrint('YUJIAN_FLUTTER_COMPAT_FAILED: $error');
      if (!mounted) return;
      setState(() => _status = '失败：$error');
    } finally {
      if (rpcRegistered) {
        _pair?.secondary.unregisterRpcMethod(rpcMethod);
      }
      await _localAudioTrack?.stop();
      await _secondaryListener?.dispose();
      await _pair?.disconnect();
      _pair = null;
      if (mounted) setState(() => _running = false);
    }
  }

  Future<Map<String, dynamic>> _requestToken(String node, String identity) async {
    final response = await http.post(
      Uri.base.resolve('/token'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'node': node, 'identity': identity}),
    );
    if (response.statusCode != 201) {
      throw StateError('token request failed: ${response.statusCode}');
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  @override
  void dispose() {
    final localAudioTrack = _localAudioTrack;
    if (localAudioTrack != null) {
      unawaited(localAudioTrack.stop().then((_) {}));
    }
    final secondaryListener = _secondaryListener;
    if (secondaryListener != null) unawaited(secondaryListener.dispose());
    final pair = _pair;
    if (pair != null) unawaited(pair.disconnect());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('语见 RTC Flutter 兼容测试'),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _running ? null : _connect,
                child: const Text('开始测试'),
              ),
              const SizedBox(height: 16),
              Text(_status, key: const Key('compat-status')),
            ],
          ),
        ),
      ),
    );
  }
}
