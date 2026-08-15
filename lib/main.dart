import 'dart:async';
import 'package:flutter/material.dart';
import 'package:carrier_pigeon/screens/home_screen.dart';
import 'package:carrier_pigeon/services/storage_service.dart';
import 'package:carrier_pigeon/utils/constants.dart';
import 'package:geolocator/geolocator.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await StorageService().init();
  runApp(const CarrierPigeonApp());
}

class CarrierPigeonApp extends StatelessWidget {
  const CarrierPigeonApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConstants.appNameFa,
      theme: AppTheme.theme,
      debugShowCheckedModeBanner: false,
      locale: const Locale('fa', 'IR'),
      home: const PermissionGate(),
    );
  }
}

/// Requests GPS permission before showing the main app
class PermissionGate extends StatefulWidget {
  const PermissionGate({super.key});

  @override
  State<PermissionGate> createState() => _PermissionGateState();
}

class _PermissionGateState extends State<PermissionGate> {
  bool _loading = true;
  String _status = 'در حال بررسی دسترسی GPS...';

  @override
  void initState() {
    super.initState();
    _requestPermission();
  }

  Future<void> _requestPermission() async {
    try {
      // Check if location services are enabled
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() => _status = 'GPS غیرفعال است. لطفاً GPS را روشن کنید.');
        // Wait and retry
        await Future.delayed(const Duration(seconds: 2));
        serviceEnabled = await Geolocator.isLocationServiceEnabled();
        if (!serviceEnabled) {
          setState(() {
            _status = 'لطفاً GPS را روشن کنید و دوباره تلاش کنید';
            _loading = false;
          });
          return;
        }
      }

      // Check permission
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        setState(() => _status = 'در حال درخواست دسترسی GPS...');
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        setState(() {
          _status = 'دسترسی GPS رد شد. بدون GPS ادامه می‌دهیم.';
          _loading = false;
        });
        // Wait 2 seconds then continue anyway
        await Future.delayed(const Duration(seconds: 2));
      } else {
        // Get current location
        setState(() => _status = 'در حال دریافت موقعیت...');
        try {
          Position position = await Geolocator.getCurrentPosition(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              timeLimit: Duration(seconds: 10),
            ),
          );
          // Save location
          final storage = StorageService();
          await storage.saveMyLocation(position.latitude, position.longitude);
          setState(() => _status = 'موقعیت دریافت شد!');
        } catch (e) {
          setState(() => _status = 'خطا در دریافت موقعیت. از موقعیت پیش‌فرض استفاده می‌شود.');
          await Future.delayed(const Duration(seconds: 1));
        }
      }
    } catch (e) {
      setState(() => _status = 'خطا: $e');
      await Future.delayed(const Duration(seconds: 2));
    }

    // Navigate to main app
    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('🕊️', style: TextStyle(fontSize: 80)),
            const SizedBox(height: 24),
            Text(
              AppConstants.appNameFa,
              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 32),
            if (_loading) ...[
              const SizedBox(
                width: 30,
                height: 30,
                child: CircularProgressIndicator(strokeWidth: 3),
              ),
              const SizedBox(height: 16),
            ],
            Text(
              _status,
              style: const TextStyle(fontSize: 14, color: Colors.grey),
              textAlign: TextAlign.center,
            ),
            if (!_loading) ...[
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () {
                  setState(() { _loading = true; _status = 'در حال بررسی...'; });
                  _requestPermission();
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                ),
                child: const Text('تلاش مجدد'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
