import 'package:flutter_test/flutter_test.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:yujian_rtc_flutter_compat/yujian_rtc_compat.dart';

void main() {
  test('official Flutter SDK API contract compiles', () {
    const options = RoomOptions(adaptiveStream: true, dynacast: true);
    final connector = connectYujianRtc;
    final pairConnector = connectYujianRtcPair;
    expect(options.adaptiveStream, isTrue);
    expect(options.dynacast, isTrue);
    expect(connector, isA<Function>());
    expect(pairConnector, isA<Function>());
  });
}
