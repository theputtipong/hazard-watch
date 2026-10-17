import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../format.dart';
import '../l10n/gen/app_localizations.dart';
import '../sources_meta.g.dart';
import '../theme/hw_app_theme.dart';

/// A source as named in the text, and the page it links to.
typedef SourceRef = ({String name, String url});

/// [id] is a source id from the API ("tmd", "bma-flood"…); [url] overrides the source's own page (a quake's report).
/// [url] comes from the API, so only an https page is opened; anything else falls back to the source's own page.
SourceRef? sourceRef(String name, String id, {String? url}) {
  final link = url != null && Uri.tryParse(url)?.scheme == 'https' ? url : sourceUrl(id);
  return link == null ? null : (name: name, url: link);
}

/// Swapped in tests, where nothing can open a link.
@visibleForTesting
Future<bool> Function(Uri uri) launchLink = (uri) => launchUrl(uri, mode: LaunchMode.externalApplication);

/// Opens [url] outside the app. When nothing can open it, the link is copied so it is never a dead end.
Future<void> openLink(BuildContext context, String url) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  final copied = AppLocalizations.of(context).shareCopied;
  final uri = Uri.tryParse(url);
  var opened = false;
  if (uri != null) {
    try {
      opened = await launchLink(uri);
    } on Exception {
      opened = false;
    }
  }
  if (opened) return;
  await Clipboard.setData(ClipboardData(text: url));
  messenger?.showSnackBar(SnackBar(content: Text('$copied: $url')));
}

/// The source a link points at, found by its site ("https://earthquake.tmd.go.th/…" → "tmd"); null for other sites.
/// Where two sources share a site (BMA flood and rain), the one whose page the link is under wins.
String? sourceIdForUrl(String url) {
  final host = linkDomain(url);
  if (host == null) return null;
  String? found;
  for (final m in sourceMeta.values) {
    if (m.domain != host) continue;
    if (url.startsWith(m.url)) return m.id;
    found ??= m.id;
  }
  return found;
}

/// The site a link is on, without "www." ("thaiwater.net"); null for tel: and other non-web links.
String? linkDomain(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null || !(uri.scheme == 'https' || uri.scheme == 'http') || uri.host.isEmpty) return null;
  return uri.host.startsWith('www.') ? uri.host.substring(4) : uri.host;
}

/// The agency's full name ("กรมอุตุนิยมวิทยา"); NASA's feeds go by their product names. Null for an unknown id.
String? sourceAgency(AppLocalizations l, String id) => switch (id) {
  'tmd' => l.agencyTmd,
  'air4thai' => l.agencyAir4thai,
  'bma-flood' || 'bma-rain' || 'bma-traffic' => l.agencyBma,
  'thaiwater' => l.agencyThaiwater,
  'rid' => l.agencyRid,
  'usgs' => l.agencyUsgs,
  'gistda' => l.agencyGistda,
  'nasa-firms' => 'NASA FIRMS',
  'nasa-eonet' => 'NASA EONET',
  'nasa-gibs' => 'NASA GIBS',
  'open-meteo' => l.agencyOpenMeteo,
  _ => null,
};

/// The short name people know ("กทม.", "กรมอุตุฯ") for the map's credit strip.
String sourceShortName(AppLocalizations l, String id) => switch (id) {
  'rid' => l.agencyRid,
  'gistda' => 'GISTDA',
  'open-meteo' => l.agencyOpenMeteo,
  'nasa-firms' || 'nasa-eonet' || 'nasa-gibs' => sourceAgency(l, id)!,
  _ => sourceName(l, id),
};

/// "ข้อมูลจาก กรมอุตุนิยมวิทยา · earthquake.tmd.go.th" for [url]; [name] stands in for an agency the app does not know.
String sourceLinkLabel(AppLocalizations l, String url, {String? name}) {
  final id = sourceIdForUrl(url);
  final agency = (id == null ? null : sourceAgency(l, id)) ?? name;
  final domain = linkDomain(url);
  if (agency == null || domain == null) return name ?? url;
  return l.sourceDataFrom(agency, domain);
}

/// The words [AppLocalizations.sourceDataFrom] puts before the agency ("ข้อมูลจาก ").
String _dataFromPrefix(AppLocalizations l) => l.sourceDataFrom('\u0000', '').split('\u0000').first;

/// Link text is never smaller than this, so a credit stays readable (bodySmall is 13).
const double _minLinkFontSize = 14;

/// Attribution text ("ข้อมูลจาก กรมอุตุฯ · 17:00 น.") with each source as a link to its original page.
/// Google Play requires apps showing government data to link the original source wherever the data is credited, and
/// the link must say whose data it is and where it goes: with [describe] on, each known source's name is shown as its
/// agency's full name and site ("ข้อมูลจาก กรมอุตุนิยมวิทยา · earthquake.tmd.go.th · 17:00 น."), the "ข้อมูลจาก" before
/// it becoming part of the link.
class SourceText extends StatelessWidget {
  const SourceText(this.text, {super.key, required this.sources, this.style, this.describe = true});

  final String text;

  /// Linked in order of appearance; a name missing from [text] is skipped.
  final List<SourceRef> sources;
  final TextStyle? style;

  /// False keeps each name exactly as written (NASA's own credit wording).
  final bool describe;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final base = style ?? Theme.of(context).textTheme.bodySmall!;
    final prefix = _dataFromPrefix(l);
    final spans = <InlineSpan>[];
    var at = 0;
    for (final s in sources) {
      final i = text.indexOf(s.name, at);
      if (i < 0) continue;
      var before = text.substring(at, i);
      var label = s.name;
      final id = describe ? sourceIdForUrl(s.url) : null;
      final agency = id == null ? null : sourceAgency(l, id);
      final domain = linkDomain(s.url);
      if (agency != null && domain != null) {
        if (prefix.isNotEmpty && before.endsWith(prefix)) {
          before = before.substring(0, before.length - prefix.length);
          label = l.sourceDataFrom(agency, domain);
        } else {
          label = '$agency · $domain';
        }
      }
      if (before.isNotEmpty) spans.add(TextSpan(text: before));
      spans.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.middle,
          child: SourceLink(label: label, url: s.url, style: base),
        ),
      );
      at = i + s.name.length;
    }
    if (at < text.length) spans.add(TextSpan(text: text.substring(at)));
    return Text.rich(TextSpan(children: spans), style: base);
  }
}

/// One tappable link, at least a full touch target in size, underlined in the theme's link colour.
/// With an empty [label] it reads "ข้อมูลจาก {agency} · {domain}" for [url].
class SourceLink extends StatelessWidget {
  const SourceLink({super.key, this.label = '', required this.url, this.style});

  final String label;
  final String url;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final base = style ?? Theme.of(context).textTheme.bodyMedium!;
    final size = base.fontSize ?? _minLinkFontSize;
    final shown = label.isEmpty ? sourceLinkLabel(l, url) : label;
    // Its own node with its own tap, so screen readers can reach and open each link in a line of text.
    return Semantics(
      container: true,
      link: true,
      label: url.startsWith('tel:') ? shown : '$shown, ${l.sourcesOpenLink}',
      onTap: () => openLink(context, url),
      excludeSemantics: true,
      child: InkWell(
        onTap: () => openLink(context, url),
        borderRadius: BorderRadius.circular(HwSize.radiusTiny),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: HwSize.touchTarget, minHeight: HwSize.touchTarget),
          child: Align(
            alignment: Alignment.centerLeft,
            widthFactor: 1,
            heightFactor: 1,
            child: Text(
              shown,
              style: base.copyWith(
                color: c.accent,
                fontSize: size < _minLinkFontSize ? _minLinkFontSize : size,
                decoration: TextDecoration.underline,
                decorationColor: c.accent,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
