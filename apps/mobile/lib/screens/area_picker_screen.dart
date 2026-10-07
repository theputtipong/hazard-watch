import 'package:flutter/material.dart';

import '../api/hazard_api.dart';
import '../api/models.dart';
import '../l10n/gen/app_localizations.dart';
import '../location.dart';
import '../theme/hw_app_theme.dart';

/// Opens the picker; returns the chosen district, or null if the person backs out.
Future<District?> pickDistrict(BuildContext context, HazardApi api, LocationService location) =>
    Navigator.of(context).push<District>(
      MaterialPageRoute(
        builder: (_) => AreaPickerScreen(api: api, location: location),
      ),
    );

/// "Use my location" first (main action, bottom half of the screen on phones), then every district by province.
class AreaPickerScreen extends StatefulWidget {
  const AreaPickerScreen({super.key, required this.api, required this.location});

  final HazardApi api;
  final LocationService location;

  @override
  State<AreaPickerScreen> createState() => _AreaPickerScreenState();
}

class _AreaPickerScreenState extends State<AreaPickerScreen> {
  late Future<List<District>> _districts = widget.api.districts();
  String _query = '';
  bool _locating = false;
  String? _locationMessage;

  Future<void> _useLocation() async {
    final l = AppLocalizations.of(context);
    setState(() {
      _locating = true;
      _locationMessage = null;
    });
    String? message;
    District? found;
    final fix = await widget.location.current();
    if (fix is LocationFound) {
      try {
        found = (await widget.api.area(lat: fix.lat, lng: fix.lng)).district;
      } on OutsideCoverageException {
        message = l.extOutside;
      } on ApiException {
        message = l.extLoadFailed;
      }
    } else if (fix is LocationUnavailable) {
      message = fix.denied ? l.permissionLocationDenied : l.extGpsFailed;
    }
    if (!mounted) return;
    if (found != null) {
      Navigator.of(context).pop(found);
      return;
    }
    setState(() {
      _locating = false;
      _locationMessage = message;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    final locale = Localizations.localeOf(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.locationPick), backgroundColor: c.bg, surfaceTintColor: Colors.transparent),
      body: SafeArea(
        child: FutureBuilder<List<District>>(
          future: _districts,
          builder: (context, snap) {
            final list = (snap.data ?? const <District>[]).where((d) {
              if (_query.isEmpty) return true;
              final q = _query.toLowerCase();
              return d.name.th.contains(q) ||
                  d.name.en.toLowerCase().contains(q) ||
                  (d.province?.th.contains(q) ?? false);
            }).toList();
            return ListView(
              padding: const EdgeInsets.all(HwSize.space4),
              children: [
                Text(l.permissionLocation, style: text.bodyLarge!.copyWith(color: c.inkMuted)),
                const SizedBox(height: HwSize.space3),
                FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(HwSize.touchTarget)),
                  onPressed: _locating ? null : _useLocation,
                  icon: const Icon(Icons.my_location_rounded, size: 20),
                  label: Text(_locating ? l.extLocating : l.locationUseMine),
                ),
                if (_locationMessage != null) ...[
                  const SizedBox(height: HwSize.space2),
                  Text(_locationMessage!, style: text.bodyLarge),
                ],
                const SizedBox(height: HwSize.space6),
                Text(l.extPickDistrict, style: text.labelLarge!.copyWith(color: c.inkMuted)),
                const SizedBox(height: HwSize.space2),
                TextField(
                  decoration: InputDecoration(hintText: l.areaSearch, prefixIcon: const Icon(Icons.search_rounded)),
                  onChanged: (v) => setState(() => _query = v.trim()),
                ),
                const SizedBox(height: HwSize.space2),
                if (snap.connectionState == ConnectionState.waiting)
                  Padding(
                    padding: const EdgeInsets.all(HwSize.space4),
                    child: Text(l.commonLoading, style: text.bodyLarge!.copyWith(color: c.inkMuted)),
                  )
                else if (snap.hasError)
                  Row(
                    children: [
                      Expanded(child: Text(l.extLoadFailed, style: text.bodyLarge)),
                      TextButton(
                        onPressed: () => setState(() => _districts = widget.api.districts()),
                        child: Text(l.commonRetry),
                      ),
                    ],
                  )
                else
                  for (var i = 0; i < list.length; i++) ...[
                    if (i == 0 || list[i].province?.th != list[i - 1].province?.th)
                      Padding(
                        padding: const EdgeInsets.only(top: HwSize.space4, bottom: HwSize.space1),
                        child: Semantics(
                          header: true,
                          child: Text(
                            list[i].province?.of(locale) ?? '',
                            style: text.labelLarge!.copyWith(color: c.inkMuted),
                          ),
                        ),
                      ),
                    ListTile(
                      minTileHeight: HwSize.touchTarget,
                      contentPadding: EdgeInsets.zero,
                      title: Text(list[i].name.of(locale), style: text.bodyLarge),
                      onTap: () => Navigator.of(context).pop(list[i]),
                    ),
                  ],
              ],
            );
          },
        ),
      ),
    );
  }
}
