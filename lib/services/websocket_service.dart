import 'dart:async';
import 'dart:convert';
import 'package:carrier_pigeon/models/message.dart';
import 'package:carrier_pigeon/models/contact.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class WebSocketService {
  static final WebSocketService _instance = WebSocketService._internal();
  factory WebSocketService() => _instance;
  WebSocketService._internal();

  static const String wsUrl = 'wss://bitter-cake-f6bc.bahparda.workers.dev/ws';

  WebSocketChannel? _channel;
  bool _connected = false;
  String? _userId;

  final _messageController = StreamController<PigeonMessage>.broadcast();
  final _userController = StreamController<List<Contact>>.broadcast();
  final _pigeonController = StreamController<PigeonMessage>.broadcast();
  final _statusController = StreamController<bool>.broadcast();

  Stream<PigeonMessage> get messageStream => _messageController.stream;
  Stream<List<Contact>> get userStream => _userController.stream;
  Stream<PigeonMessage> get pigeonStream => _pigeonController.stream;
  Stream<bool> get statusStream => _statusController.stream;
  bool get isConnected => _connected;

  Future<void> connect({
    required String userId,
    required String name,
    required String avatar,
    required double lat,
    required double lng,
    required String city,
  }) async {
    _userId = userId;

    try {
      _channel = WebSocketChannel.connect(Uri.parse(wsUrl));

      _channel!.stream.listen(
        (data) {
          try {
            final msg = jsonDecode(data as String) as Map<String, dynamic>;
            _handleMessage(msg);
          } catch (e) {
            print('❌ WS Parse Error: $e');
          }
        },
        onDone: () {
          _connected = false;
          _statusController.add(false);
          // Reconnect after 3 seconds
          Future.delayed(const Duration(seconds: 3), () {
            if (_userId != null) connect(
              userId: userId, name: name, avatar: avatar,
              lat: lat, lng: lng, city: city,
            );
          });
        },
        onError: (e) {
          print('❌ WS Error: $e');
          _connected = false;
          _statusController.add(false);
        },
      );

      // Wait for connection
      await Future.delayed(const Duration(milliseconds: 500));
      _connected = true;
      _statusController.add(true);

      // Register user
      _send({
        'type': 'register',
        'data': {
          'userId': userId,
          'name': name,
          'avatar': avatar,
          'lat': lat,
          'lng': lng,
          'city': city,
        },
      });
    } catch (e) {
      print('❌ WS Connect Error: $e');
      _connected = false;
      _statusController.add(false);
    }
  }

  void sendMessage({
    required String receiverId,
    required String content,
  }) {
    _send({
      'type': 'send_message',
      'data': {
        'receiverId': receiverId,
        'content': content,
      },
    });
  }

  void updateLocation(double lat, double lng) {
    _send({
      'type': 'update_location',
      'data': {'lat': lat, 'lng': lng},
    });
  }

  void _send(Map<String, dynamic> msg) {
    if (!_connected || _channel == null) return;
    try {
      _channel!.sink.add(jsonEncode(msg));
    } catch (e) {
      print('❌ WS Send Error: $e');
    }
  }

  void _handleMessage(Map<String, dynamic> msg) {
    switch (msg['type']) {
      case 'welcome':
        final users = (msg['data']['users'] as List)
            .map((u) => Contact.fromMap(u as Map<String, dynamic>))
            .toList();
        _userController.add(users);
        final messages = (msg['data']['messages'] as List)
            .map((m) => PigeonMessage.fromMap(m as Map<String, dynamic>))
            .toList();
        for (final m in messages) {
          _messageController.add(m);
        }
        break;
      case 'new_message':
        _messageController.add(PigeonMessage.fromMap(msg['data'] as Map<String, dynamic>));
        break;
      case 'pigeon_update':
        _pigeonController.add(PigeonMessage.fromMap(msg['data'] as Map<String, dynamic>));
        break;
      case 'user_online':
      case 'user_offline':
        // Will trigger user list refresh
        break;
      case 'pong':
        break;
    }
  }

  void disconnect() {
    _connected = false;
    _userId = null;
    _statusController.add(false);
    _channel?.sink.close();
  }

  void dispose() {
    disconnect();
    _messageController.close();
    _userController.close();
    _pigeonController.close();
    _statusController.close();
  }
}
