import 'package:flutter/material.dart';
import 'package:carrier_pigeon/services/storage_service.dart';
import 'package:carrier_pigeon/utils/constants.dart';
import 'package:geolocator/geolocator.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _nameController = TextEditingController();
  final _cityController = TextEditingController();
  final _latController = TextEditingController();
  final _lngController = TextEditingController();
  bool _gpsLoading = false;

  @override
  void initState() {
    super.initState();
    final storage = StorageService();
    _nameController.text = storage.getMyName();
    _cityController.text = storage.getMyCity();
    _latController.text = storage.myLat.toStringAsFixed(6);
    _lngController.text = storage.myLng.toStringAsFixed(6);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _cityController.dispose();
    _latController.dispose();
    _lngController.dispose();
    super.dispose();
  }

  void _saveSettings() async {
    final storage = StorageService();
    await storage.saveMyName(_nameController.text.trim());
    await storage.saveMyCity(_cityController.text.trim());
    final lat = double.tryParse(_latController.text) ?? 35.6892;
    final lng = double.tryParse(_lngController.text) ?? 51.3890;
    await storage.saveMyLocation(lat, lng);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✅ تنظیمات ذخیره شد'),
          backgroundColor: AppColors.pigeonDelivered,
        ),
      );
    }
  }

  void _getCurrentLocation() async {
    setState(() => _gpsLoading = true);
    try {
      bool enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('⚠️ GPS غیرفعال است')),
          );
        }
        setState(() => _gpsLoading = false);
        return;
      }

      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }

      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('⚠️ دسترسی GPS رد شد')),
          );
        }
        setState(() => _gpsLoading = false);
        return;
      }

      Position pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );

      setState(() {
        _latController.text = pos.latitude.toStringAsFixed(6);
        _lngController.text = pos.longitude.toStringAsFixed(6);
        _gpsLoading = false;
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ موقعیت فعلی دریافت شد'),
            backgroundColor: AppColors.pigeonDelivered,
          ),
        );
      }
    } catch (e) {
      setState(() => _gpsLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('خطا: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('⚙️ تنظیمات'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Profile section
            _buildSection('👤 پروفایل', [
              _buildTextField('نام شما', _nameController, Icons.person),
              const SizedBox(height: 12),
              _buildTextField('شهر', _cityController, Icons.location_city),
            ]),
            const SizedBox(height: 20),

            // Location section
            _buildSection('📍 مکان شما', [
              Row(
                children: [
                  Expanded(
                    child: _buildTextField(
                        'عرض جغرافیایی', _latController, Icons.my_location),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildTextField(
                        'طول جغرافیایی', _lngController, Icons.my_location),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _gpsLoading ? null : _getCurrentLocation,
                      icon: _gpsLoading
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.my_location, size: 18),
                      label: const Text('موقعیت فعلی'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        _latController.text = '35.6892';
                        _lngController.text = '51.3890';
                        _cityController.text = 'تهران';
                      },
                      icon: const Icon(Icons.location_city, size: 18),
                      label: const Text('تهران'),
                    ),
                  ),
                ],
              ),
            ]),
            const SizedBox(height: 20),

            // About section
            _buildSection('ℹ️ درباره', [
              _buildInfoRow('نام اپ', AppConstants.appName),
              _buildInfoRow('نسخه', '2.0.0'),
              _buildInfoRow('سرعت کبوتر', '${AppConstants.pigeonSpeedKmh} km/h'),
              _buildInfoRow('احتمال گم شدن',
                  '${(AppConstants.lostProbability * 100).toStringAsFixed(1)}%'),
              _buildInfoRow('تغییر سرعت',
                  '±${(AppConstants.speedVariance * 100).toStringAsFixed(0)}%'),
            ]),
            const SizedBox(height: 20),

            // Save button
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _saveSettings,
                icon: const Text('🕊️', style: TextStyle(fontSize: 20)),
                label: const Text(
                  'ذخیره تنظیمات',
                  style: TextStyle(fontSize: 16),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSection(String title, List<Widget> children) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _buildTextField(
      String label, TextEditingController controller, IconData icon) {
    return TextField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        border: const OutlineInputBorder(),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.grey[600])),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
