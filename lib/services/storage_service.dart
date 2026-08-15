import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:carrier_pigeon/models/message.dart';

class StorageService {
  static final StorageService _instance = StorageService._internal();
  factory StorageService() => _instance;
  StorageService._internal();

  SharedPreferences? _prefs;

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  Future<void> saveMessages(List<PigeonMessage> messages) async {
    final jsonList = messages.map((m) => m.toMap()).toList();
    await _prefs?.setString('messages', jsonEncode(jsonList));
  }

  List<PigeonMessage> loadMessages() {
    final str = _prefs?.getString('messages');
    if (str == null) return [];
    final List<dynamic> jsonList = jsonDecode(str);
    return jsonList.map((m) => PigeonMessage.fromMap(m)).toList();
  }

  Future<void> saveMyId(String id) async {
    await _prefs?.setString('my_id', id);
  }

  String getMyId() => _prefs?.getString('my_id') ?? '';

  Future<void> saveMyName(String name) async {
    await _prefs?.setString('my_name', name);
  }

  String getMyName() => _prefs?.getString('my_name') ?? 'کاربر';

  Future<void> saveMyCity(String city) async {
    await _prefs?.setString('my_city', city);
  }

  String getMyCity() => _prefs?.getString('my_city') ?? 'تهران';

  Future<void> saveMyLocation(double lat, double lng) async {
    await _prefs?.setDouble('my_lat', lat);
    await _prefs?.setDouble('my_lng', lng);
  }

  double get myLat => _prefs?.getDouble('my_lat') ?? 35.6892;
  double get myLng => _prefs?.getDouble('my_lng') ?? 51.3890;
}
