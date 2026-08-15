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
  bool _connecting = false;
  String? _userId;
  Timer? _pingTimer;
  Timer? _reconnectTimer;

  // Store connect params for reconnect
  String _name = '';
  String _avatar = '🕊️';
  double _lat = 0;
  double _lng = 0;
  String _city = '';

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
    // Don't reconnect if already connecting
    if (_connecting) return;

    _userId = userId;
    _name = name;
    _avatar = avatar;
    _lat = lat;
    _lng = lng;
    _city = city;
    _connecting = true;

    try {
      // Close old connection first
      _channel?.sink.close();

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
          _connecting = false;
          _stopPing();
          _statusController.add(false);
          _scheduleReconnect();
        },
        onError: (e) {
          print('❌ WS Error: $e');
          _connected = false;
          _connecting = false;
          _stopPing();
          _statusController.add(false);
          _scheduleReconnect();
        },
      );

      // Wait for connection to establish
      await Future.delayed(const Duration(milliseconds: 500));
      _connected = true;
      _connecting = false;
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

      // Start ping keepalive (every 15 seconds)
      _startPing();
    } catch (e) {
      print('❌ WS Connect Error: $e');
      _connected = false;
      _connecting = false;
      _statusController.add(false);
      _scheduleReconnect();
    }
  }

  void _startPing() {
    _stopPing();
    _pingTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      _send({'type': 'ping'});
    });
  }

  void _stopPing() {
    _pingTimer?.cancel();
    _pingTimer = null;
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 3), () {
      if (_userId != null && !_connected && !_connecting) {
        connect(
          userId: _userId!,
          name: _name,
          avatar: _avatar,
          lat: _lat,
          lng: _lng,
          city: _city,
        );
      }
    });
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
      case 'connected':
        // Server confirmed connection
        break;
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
        _messageController.add(
            PigeonMessage.fromMap(msg['data'] as Map<String, dynamic>));
        break;
      case 'pigeon_update':
        _pigeonController.add(
            PigeonMessage.fromMap(msg['data'] as Map<String, dynamic>));
        break;
      case 'user_online':
        // Refresh user list on next welcome
        break;
      case 'user_offline':
        break;
      case 'pong':
        // Keepalive response
        break;
    }
  }

  void disconnect() {
    _stopPing();
    _reconnectTimer?.cancel();
    _connected = false;
    _connecting = false;
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
