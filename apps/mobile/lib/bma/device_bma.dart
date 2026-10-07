import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'bma_parse.dart';

// BMA blocks Cloudflare and GitHub Actions IPs, so the server's flood/rain feeds fail; a phone in Thailand can reach it.
// What a phone fetches is only shown on that phone and never sent to our API: we cannot verify it, and fake flood data
// would trigger false alerts for everyone.

enum BmaKind {
  flood('https://weather.bangkok.go.th/Flood/PageMap/GetDataTable'),
  rain('https://weather.bangkok.go.th/rain/PageMap/GetDataForUpdate');

  const BmaKind(this.url);
  final String url;

  /// The feed topic in `/v1/area` that this replaces.
  String get topic => name;
}

abstract interface class BmaFetcher {
  /// The raw JSON array; throws on any failure.
  Future<List<Object?>> fetch(BmaKind kind);
}

class HttpBmaFetcher implements BmaFetcher {
  HttpBmaFetcher({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  static const _timeout = Duration(seconds: 15);

  @override
  Future<List<Object?>> fetch(BmaKind kind) async {
    final res = await _client
        .post(Uri.parse(kind.url), headers: {'content-type': 'application/json'}, body: '{}')
        .timeout(_timeout);
    if (res.statusCode != 200) throw http.ClientException('HTTP ${res.statusCode}', res.request?.url);
    return jsonDecode(utf8.decode(res.bodyBytes)) as List<Object?>;
  }
}

abstract interface class BmaStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class PrefsBmaStore implements BmaStore {
  PrefsBmaStore(this._prefs);
  final SharedPreferencesAsync _prefs;

  @override
  Future<String?> read(String key) => _prefs.getString(key);

  @override
  Future<void> write(String key, String value) => _prefs.setString(key, value);
}

/// The last good download of one BMA list. [failedAt] is when downloads started failing; the copy is then old.
class BmaCopy {
  const BmaCopy({required this.items, required this.fetchedAt, this.failedAt});

  final List<BmaObservation> items;
  final DateTime fetchedAt;
  final DateTime? failedAt;

  bool get failed => failedAt != null;
}

/// BMA data downloaded on this phone, reused for [maxAge] (in memory and across restarts) so opening the app often
/// does not hammer BMA.
class DeviceBma {
  DeviceBma({required this.fetcher, this.store});

  static const maxAge = Duration(minutes: 10);

  final BmaFetcher fetcher;
  final BmaStore? store;
  final _copies = <BmaKind, BmaCopy?>{};
  final _pending = <BmaKind, Future<BmaCopy?>>{};

  /// A copy at most [maxAge] old, downloading a new one when needed. When the download fails the previous copy comes
  /// back with [BmaCopy.failed]; null when there has never been one.
  Future<BmaCopy?> get(BmaKind kind, DateTime now) => _pending[kind] ??= _get(kind, now).whenComplete(() {
    _pending.remove(kind);
  });

  Future<BmaCopy?> _get(BmaKind kind, DateTime now) async {
    final cached = _copies.containsKey(kind) ? _copies[kind] : _copies[kind] = await _load(kind);
    if (cached != null && !cached.failed && now.difference(cached.fetchedAt) < maxAge) return cached;
    try {
      final raw = await fetcher.fetch(kind);
      final items = kind == BmaKind.flood ? parseBmaFlood(raw, now) : parseBmaRain(raw, now);
      final copy = BmaCopy(items: items, fetchedAt: now);
      _copies[kind] = copy;
      await _save(kind, copy);
      return copy;
    } on Object {
      if (cached == null) return null;
      return _copies[kind] = BmaCopy(
        items: cached.items,
        fetchedAt: cached.fetchedAt,
        failedAt: cached.failedAt ?? now,
      );
    }
  }

  String _key(BmaKind kind) => 'bma.${kind.name}';

  Future<BmaCopy?> _load(BmaKind kind) async {
    try {
      final saved = await store?.read(_key(kind));
      if (saved == null) return null;
      final j = jsonDecode(saved) as Map<String, dynamic>;
      return BmaCopy(
        fetchedAt: DateTime.parse(j['fetchedAt'] as String),
        items: [for (final o in j['items'] as List) BmaObservation.fromJson(o as Map<String, dynamic>)],
      );
    } on Object {
      return null;
    }
  }

  Future<void> _save(BmaKind kind, BmaCopy copy) async {
    try {
      await store?.write(
        _key(kind),
        jsonEncode({
          'fetchedAt': copy.fetchedAt.toUtc().toIso8601String(),
          'items': [for (final o in copy.items) o.toJson()],
        }),
      );
    } on Object {
      // Not saved: the next start downloads again.
    }
  }
}
