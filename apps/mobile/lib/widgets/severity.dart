import 'package:flutter/material.dart';

import '../l10n/gen/app_localizations.dart';
import '../theme/hw_app_theme.dart';

/// Bar sizes from the mobile design system's components/bundle.css (`.m-meter`, `.m-meter--lg`).
const _barHeightsSm = [7.0, 10.0, 14.0];
const _barHeightsLg = [11.0, 16.0, 22.0];
const _inactiveOpacity = 0.28;

/// Level = number of filled bars, so severity reads without colour. Colour follows the surrounding text.
class SeverityMeter extends StatelessWidget {
  const SeverityMeter({super.key, required this.level, this.large = false, this.color});

  final HwLevel level;
  final bool large;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final heights = large ? _barHeightsLg : _barHeightsSm;
    final c = color ?? DefaultTextStyle.of(context).style.color ?? context.hw.ink;
    return ExcludeSemantics(
      child: SizedBox(
        height: heights.last,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          spacing: large ? 3 : 2,
          children: [
            for (var i = 0; i < heights.length; i++)
              Container(
                width: large ? 6 : 4,
                height: heights[i],
                decoration: BoxDecoration(
                  color: i < level.index ? c : c.withValues(alpha: _inactiveOpacity),
                  borderRadius: BorderRadius.circular(HwSize.radiusTiny),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Design system SeverityBadge: the word plus the meter, never colour alone. 28dp tall and not tappable.
class SeverityBadge extends StatelessWidget {
  const SeverityBadge({super.key, required this.level});

  final HwLevel level;

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    final word = level.label(Localizations.localeOf(context));
    final fg = c.text(level);
    return Semantics(
      label: AppLocalizations.of(context).levelSemantics(word),
      excludeSemantics: true,
      child: Container(
        height: 28,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(color: c.soft(level), borderRadius: BorderRadius.circular(HwSize.radiusSmall)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          spacing: HwSize.space2,
          children: [
            SeverityMeter(level: level, color: fg),
            Text(
              word,
              maxLines: 1,
              softWrap: false,
              style: Theme.of(context).textTheme.labelLarge!.copyWith(color: fg),
            ),
          ],
        ),
      ),
    );
  }
}
