import 'package:flutter/material.dart';

import '../api/hazard_api.dart';
import '../api/models.dart';
import '../l10n/gen/app_localizations.dart';
import '../location.dart';
import '../theme/hw_app_theme.dart';

/// Opens the picker; returns the chosen district, or null if the person backs out. [current] opens on its province.
Future<District?> pickDistrict(BuildContext context, HazardApi api, LocationService location, {District? current}) =>
    Navigator.of(context).push<District>(
      MaterialPageRoute(
        builder: (_) => AreaPickerScreen(api: api, location: location, current: current),
      ),
    );

/// Lower case without spaces, so "Bang Kapi", "bangkapi" and "บาง กะปิ" all match.
String searchKey(String s) => s.toLowerCase().replaceAll(RegExp(r'\s+'), '');

/// One province and its districts, in the order the API sends them (Thai order).
class ProvinceGroup {
  ProvinceGroup(this.name, this.districts);

  final LocalizedText? name;
  final List<District> districts;
  late final String key = name == null ? '' : '${searchKey(name!.th)}|${searchKey(name!.en)}';
}

/// Groups by province (null province last) and builds the search keys once, so typing never re-walks 928 names twice.
class DistrictIndex {
  DistrictIndex(List<District> all) {
    final byProvince = <String, ProvinceGroup>{};
    for (final d in all) {
      final id = d.province?.th ?? '';
      (byProvince[id] ??= ProvinceGroup(d.province, [])).districts.add(d);
      _keys.add((d, '${searchKey(d.name.th)}|${searchKey(d.name.en)}'));
    }
    provinces = byProvince.values.toList();
  }

  late final List<ProvinceGroup> provinces;
  final _keys = <(District, String)>[];

  /// Districts whose own name or province name contains [query] (Thai or English, spaces ignored).
  List<District> search(String query) {
    final q = searchKey(query);
    if (q.isEmpty) return const [];
    final hitProvinces = {
      for (final p in provinces)
        if (p.key.contains(q)) p.name?.th,
    };
    return [
      for (final (d, key) in _keys)
        if (key.contains(q) || hitProvinces.contains(d.province?.th)) d,
    ];
  }

  ProvinceGroup? provinceOf(District d) => provinces.where((p) => p.name?.th == d.province?.th).firstOrNull;
}

/// "Use my location" first (main action), then search, then province → district. Lists are built lazily: the whole
/// country is 77 provinces and 928 districts.
class AreaPickerScreen extends StatefulWidget {
  const AreaPickerScreen({super.key, required this.api, required this.location, this.current});

  final HazardApi api;
  final LocationService location;
  final District? current;

  @override
  State<AreaPickerScreen> createState() => _AreaPickerScreenState();
}

class _AreaPickerScreenState extends State<AreaPickerScreen> {
  late Future<DistrictIndex> _index = _loadIndex();
  final _search = TextEditingController();
  String _query = '';
  ProvinceGroup? _province;
  bool _provinceFromCurrent = false;
  bool _locating = false;
  _LocationNote? _note;

  /// Bumped by each try and by cancel, so a late answer from a cancelled try is ignored.
  int _attempt = 0;

  Future<DistrictIndex> _loadIndex() async => DistrictIndex(await widget.api.districts());

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _cancelLocation() => setState(() {
    _attempt++;
    _locating = false;
    _note = null;
  });

  Future<void> _useLocation() async {
    final l = AppLocalizations.of(context);
    final attempt = ++_attempt;
    setState(() {
      _locating = true;
      _note = null;
    });
    _LocationNote? note;
    District? found;
    final fix = await widget.location.current();
    if (!mounted || attempt != _attempt) return;
    switch (fix) {
      case LocationFound():
        try {
          found = (await widget.api.area(lat: fix.lat, lng: fix.lng)).district;
        } on OutsideCoverageException {
          note = _LocationNote(l.extOutside);
        } on ApiException {
          note = _LocationNote(l.extLoadFailed, l.commonRetry, _useLocation);
        }
      case LocationUnavailable(:final reason):
        note = switch (reason) {
          LocationFailure.serviceOff => _LocationNote(l.locationServiceOff, l.locationTurnOn, () {
            widget.location.openLocationSettings();
          }),
          LocationFailure.denied => _LocationNote(l.permissionLocationDenied),
          LocationFailure.deniedForever => _LocationNote(l.locationBlocked, l.locationOpenSettings, () {
            widget.location.openAppSettings();
          }),
          LocationFailure.timeout => _LocationNote(l.locationTimeout, l.commonRetry, _useLocation),
          LocationFailure.error => _LocationNote(l.extGpsFailed, l.commonRetry, _useLocation),
        };
    }
    if (!mounted || attempt != _attempt) return;
    if (found != null) {
      Navigator.of(context).pop(found);
      return;
    }
    setState(() {
      _locating = false;
      _note = note;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    // Back from a province's districts returns to the province list before leaving the picker.
    return PopScope(
      canPop: _province == null,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _province = null);
      },
      child: Scaffold(
        appBar: AppBar(title: Text(l.locationPick), backgroundColor: c.bg, surfaceTintColor: Colors.transparent),
        body: SafeArea(
          child: FutureBuilder<DistrictIndex>(
            future: _index,
            builder: (context, snap) => CustomScrollView(
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(HwSize.space4, HwSize.space4, HwSize.space4, 0),
                  sliver: SliverToBoxAdapter(child: _top(context)),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(HwSize.space4, HwSize.space2, HwSize.space4, HwSize.space4),
                  sliver: _list(context, snap),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _top(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l.permissionLocation, style: text.bodyLarge!.copyWith(color: c.inkMuted)),
        const SizedBox(height: HwSize.space3),
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(HwSize.touchTarget)),
          onPressed: _locating ? null : _useLocation,
          icon: const Icon(Icons.my_location_rounded, size: 20),
          label: Text(_locating ? l.extLocating : l.locationUseMine),
        ),
        if (_locating) ...[
          const SizedBox(height: HwSize.space2),
          Row(
            children: [
              const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.5)),
              const SizedBox(width: HwSize.space3),
              Expanded(
                child: Semantics(
                  liveRegion: true,
                  child: Text(l.locationWaitHint, style: text.bodyMedium!.copyWith(color: c.inkMuted)),
                ),
              ),
              TextButton(onPressed: _cancelLocation, child: Text(l.commonCancel)),
            ],
          ),
        ],
        if (_note case final note?) ...[
          const SizedBox(height: HwSize.space2),
          Semantics(liveRegion: true, child: Text(note.message, style: text.bodyLarge)),
          if (note.actionLabel case final label?)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, HwSize.touchTarget)),
                onPressed: note.action,
                child: Text(label),
              ),
            ),
        ],
        const SizedBox(height: HwSize.space6),
        Text(l.extPickDistrict, style: text.labelLarge!.copyWith(color: c.inkMuted)),
        const SizedBox(height: HwSize.space2),
        TextField(
          controller: _search,
          decoration: InputDecoration(hintText: l.areaSearch, prefixIcon: const Icon(Icons.search_rounded)),
          onChanged: (v) => setState(() => _query = v),
        ),
      ],
    );
  }

  Widget _message(BuildContext context, String message) {
    final c = context.hw;
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: HwSize.space4),
        child: Text(message, style: Theme.of(context).textTheme.bodyLarge!.copyWith(color: c.inkMuted)),
      ),
    );
  }

  Widget _list(BuildContext context, AsyncSnapshot<DistrictIndex> snap) {
    final l = AppLocalizations.of(context);
    final text = Theme.of(context).textTheme;
    final c = context.hw;
    final locale = Localizations.localeOf(context);
    if (snap.hasError) {
      return SliverToBoxAdapter(
        child: Row(
          children: [
            Expanded(child: Text(l.extLoadFailed, style: text.bodyLarge)),
            TextButton(onPressed: () => setState(() => _index = _loadIndex()), child: Text(l.commonRetry)),
          ],
        ),
      );
    }
    final index = snap.data;
    if (index == null) return _message(context, l.commonLoading);

    // A saved pick opens on its province; an old id the list no longer has just opens the province list.
    if (!_provinceFromCurrent) {
      _provinceFromCurrent = true;
      final current = widget.current;
      if (current != null) _province = index.provinceOf(current);
    }

    if (searchKey(_query).isNotEmpty) {
      final hits = index.search(_query);
      if (hits.isEmpty) return _message(context, l.areaNoMatch);
      return SliverList.builder(
        itemCount: hits.length,
        itemBuilder: (context, i) => _DistrictRow(
          district: hits[i],
          subtitle: hits[i].province?.of(locale),
          onTap: () => Navigator.of(context).pop(hits[i]),
        ),
      );
    }

    final province = _province;
    if (province != null) {
      final districts = province.districts;
      return SliverList.builder(
        // Row 0 is the province header with the way back to all provinces.
        itemCount: districts.length + 1,
        itemBuilder: (context, i) {
          if (i == 0) {
            return Padding(
              padding: const EdgeInsets.only(top: HwSize.space2, bottom: HwSize.space1),
              child: Row(
                children: [
                  Expanded(
                    child: Semantics(
                      header: true,
                      child: Text(province.name?.of(locale) ?? '', style: text.titleMedium),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => setState(() => _province = null),
                    icon: const Icon(Icons.arrow_back_rounded, size: 20),
                    label: Text(l.areaPickProvince),
                  ),
                ],
              ),
            );
          }
          final d = districts[i - 1];
          return _DistrictRow(district: d, onTap: () => Navigator.of(context).pop(d));
        },
      );
    }

    return SliverList.builder(
      itemCount: index.provinces.length + 1,
      itemBuilder: (context, i) {
        if (i == 0) {
          return Padding(
            padding: const EdgeInsets.only(top: HwSize.space2, bottom: HwSize.space1),
            child: Semantics(
              header: true,
              child: Text(l.areaPickProvince, style: text.labelLarge!.copyWith(color: c.inkMuted)),
            ),
          );
        }
        final p = index.provinces[i - 1];
        return ListTile(
          minTileHeight: HwSize.touchTarget,
          contentPadding: EdgeInsets.zero,
          title: Text(p.name?.of(locale) ?? '', style: text.bodyLarge),
          trailing: Icon(Icons.chevron_right_rounded, color: c.inkMuted),
          onTap: () => setState(() => _province = p),
        );
      },
    );
  }
}

/// What the location try said, and the one thing that can fix it (if any). The district list below always stays.
class _LocationNote {
  _LocationNote(this.message, [this.actionLabel, this.action]);

  final String message;
  final String? actionLabel;
  final VoidCallback? action;
}

class _DistrictRow extends StatelessWidget {
  const _DistrictRow({required this.district, required this.onTap, this.subtitle});

  final District district;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return ListTile(
      minTileHeight: HwSize.touchTarget,
      contentPadding: EdgeInsets.zero,
      title: Text(district.name.of(Localizations.localeOf(context)), style: text.bodyLarge),
      subtitle: subtitle == null ? null : Text(subtitle!, style: text.bodySmall),
      onTap: onTap,
    );
  }
}
