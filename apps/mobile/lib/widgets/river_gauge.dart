import 'package:flutter/material.dart';

import '../theme/hw_app_theme.dart';

/// Water-level thresholds, % of bank-full: DEFAULT_CONFIG.waterLevel in packages/core/src/config.ts (70/100/120).
const gaugeTicks = (watch: 70.0, warn: 100.0, danger: 120.0);

/// The track spans 0–130 % (design system RiverGauge).
const _trackMax = 130.0;

/// One gauge row (`.m-gauge`): the result comes before the number, which is never cut; a long name is.
class RiverGauge extends StatelessWidget {
  const RiverGauge({
    super.key,
    required this.name,
    required this.pct,
    required this.level,
    required this.state,
    required this.semantics,
    required this.tickLabels,
  });

  final String name;
  final double pct;
  final HwLevel level;

  /// "น้ำสูง ยังไม่ล้น"
  final String state;

  /// "น้ำสูง ยังไม่ล้น 86% ของตลิ่ง"
  final String semantics;

  /// Labels under the watch / warn / danger ticks.
  final (String, String, String) tickLabels;

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    final label = text.labelLarge!;
    final pctText = '$state · ${pct.round()}%';
    return Semantics(
      label: name,
      value: semantics,
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: HwSize.space2,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: HwSize.space3,
            children: [
              Expanded(
                child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: label),
              ),
              // Flexible: a long state wraps on a narrow phone rather than running off the edge.
              Flexible(
                child: Text(
                  pctText,
                  textAlign: TextAlign.right,
                  style: label.copyWith(
                    fontWeight: FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()],
                    color: level == HwLevel.normal ? c.ink : c.text(level),
                  ),
                ),
              ),
            ],
          ),
          LayoutBuilder(
            builder: (context, box) {
              final w = box.maxWidth;
              double x(double p) => w * (p.clamp(0, _trackMax) / _trackMax);
              final ticks = [gaugeTicks.watch, gaugeTicks.warn, gaugeTicks.danger];
              final labels = [tickLabels.$1, tickLabels.$2, tickLabels.$3];
              return Column(
                spacing: 2,
                children: [
                  SizedBox(
                    height: 16,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Positioned(
                          left: 0,
                          right: 0,
                          top: 3,
                          height: 10,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: c.surfaceSunken,
                              borderRadius: BorderRadius.circular(HwSize.radiusPill),
                            ),
                          ),
                        ),
                        Positioned(
                          left: 0,
                          top: 3,
                          height: 10,
                          width: x(pct),
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: gaugeBarColor(c, level),
                              borderRadius: BorderRadius.circular(HwSize.radiusPill),
                            ),
                          ),
                        ),
                        for (final t in ticks)
                          Positioned(
                            left: x(t) - 1,
                            top: 0,
                            width: 2,
                            height: 16,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: c.lineControl,
                                borderRadius: BorderRadius.circular(HwSize.radiusTiny),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  SizedBox(
                    height: 20,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        for (var i = 0; i < ticks.length; i++)
                          Positioned(
                            left: x(ticks[i]),
                            child: FractionalTranslation(
                              translation: const Offset(-0.5, 0),
                              child: Text(labels[i], softWrap: false, style: text.bodySmall),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

/// The level's fill, unless it is under 3:1 on the sunken track (light colour-blind watch: 1.4:1), then its text tone.
Color gaugeBarColor(HwColors c, HwLevel level) =>
    contrastRatio(c.solid(level), c.surfaceSunken) >= 3 ? c.solid(level) : c.text(level);
