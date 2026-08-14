class Contact {
  final String id;
  final String name;
  final String avatar;
  final double lat;
  final double lng;
  final String city;

  const Contact({
    required this.id,
    required this.name,
    this.avatar = '🕊️',
    required this.lat,
    required this.lng,
    this.city = '',
  });

  Map<String, dynamic> toMap() => {
        'id': id,
        'name': name,
        'avatar': avatar,
        'lat': lat,
        'lng': lng,
        'city': city,
      };

  factory Contact.fromMap(Map<String, dynamic> m) => Contact(
        id: m['id'],
        name: m['name'],
        avatar: m['avatar'] ?? '🕊️',
        lat: (m['lat'] ?? 0).toDouble(),
        lng: (m['lng'] ?? 0).toDouble(),
        city: m['city'] ?? '',
      );

  static List<Contact> sampleContacts = [
    Contact(
        id: 'c1', name: 'علی', avatar: '👨', lat: 35.6892, lng: 51.3890, city: 'تهران'),
    Contact(
        id: 'c2', name: 'سارا', avatar: '👩', lat: 32.6546, lng: 51.6680, city: 'اصفهان'),
    Contact(
        id: 'c3', name: 'محمد', avatar: '🧔', lat: 38.0784, lng: 46.2889, city: 'تبریز'),
    Contact(
        id: 'c4', name: 'زهرا', avatar: '👩‍🦱', lat: 29.5918, lng: 52.5836, city: 'شیراز'),
    Contact(
        id: 'c5', name: 'رضا', avatar: '👨‍🦰', lat: 36.2605, lng: 59.6168, city: 'مشهد'),
    Contact(
        id: 'c6', name: 'مریم', avatar: '👧', lat: 34.3142, lng: 47.0650, city: 'همدان'),
    Contact(
        id: 'c7', name: 'امیر', avatar: '🧑', lat: 30.3515, lng: 48.3243, city: 'آبادان'),
    Contact(
        id: 'c8', name: 'نیلوفر', avatar: '👩‍🦳', lat: 27.1832, lng: 56.2764, city: 'بندرعباس'),
  ];
}
