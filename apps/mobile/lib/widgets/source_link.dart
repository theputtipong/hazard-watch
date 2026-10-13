import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

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

/// Attribution text ("ข้อมูลจาก กรมอุตุฯ · 17:00 น.") with each source name as a link to its original page.
/// Google Play requires apps showing government data to link the original source wherever the data is credited.
class SourceText extends StatelessWidget {
  const SourceText(this.text, {super.key, required this.sources, this.style});

  final String text;

  /// Linked in order of appearance; a name missing from [text] is skipped.
  final List<SourceRef> sources;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final base = style ?? Theme.of(context).textTheme.bodySmall!;
    final spans = <InlineSpan>[];
    var at = 0;
    for (final s in sources) {
      final i = text.indexOf(s.name, at);
      if (i < 0) continue;
      if (i > at) spans.add(TextSpan(text: text.substring(at, i)));
      spans.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.middle,
          child: SourceLink(label: s.name, url: s.url, style: base),
        ),
      );
      at = i + s.name.length;
    }
    if (at < text.length) spans.add(TextSpan(text: text.substring(at)));
    return Text.rich(TextSpan(children: spans), style: base);
  }
}

/// One tappable link, at least a full touch target in size.
class SourceLink extends StatelessWidget {
  const SourceLink({super.key, required this.label, required this.url, this.style});

  final String label;
  final String url;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final base = style ?? Theme.of(context).textTheme.bodyMedium!;
    // Its own node with its own tap, so screen readers can reach and open each link in a line of text.
    return Semantics(
      container: true,
      link: true,
      label: url.startsWith('tel:') ? label : '$label, ${l.sourcesOpenLink}',
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
              label,
              style: base.copyWith(color: c.accent, decoration: TextDecoration.underline, decorationColor: c.accent),
            ),
          ),
        ),
      ),
    );
  }
}
