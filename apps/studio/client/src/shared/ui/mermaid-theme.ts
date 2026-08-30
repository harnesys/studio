function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function mix(tint: string, base: string, amount: number): string {
  return `color-mix(in oklab, ${tint} ${amount}%, ${base})`;
}

function mindmapThemeCss(opts: {
  muted: string;
  card: string;
  border: string;
  foreground: string;
  mutedFg: string;
  live: string;
  tints: string[];
}): string {
  const { muted, card, border, foreground, mutedFg, live, tints } = opts;
  const rootFill = mix(live, muted, 48);
  const sections = tints
    .map((tint, i) => {
      const fill = mix(tint, card, 30);
      const stroke = mix(tint, border, 50);
      const edge = mix(tint, mutedFg, 55);
      return [
        `.section-${i} :is(rect,circle,path,polygon,ellipse),.section-${i} .node-bkg{fill:${fill}!important;stroke:${stroke}!important}`,
        `.section-edge-${i}{stroke:${edge}!important;fill:none!important}`,
        `.section-${i} line,.section-${i} .node-line-{stroke:${stroke}!important}`,
      ].join('');
    })
    .join('');
  return [
    `.section-root :is(rect,circle,path,polygon,ellipse),.section--1 :is(rect,circle,path,polygon,ellipse),.section-root .node-bkg,.section--1 .node-bkg{fill:${rootFill}!important;stroke:${live}!important}`,
    `.section-root :is(text,tspan),.section--1 :is(text,tspan),.mindmap-node :is(text,tspan){fill:${foreground}!important}`,
    `.section-root span,.mindmap-node span{color:${foreground}!important}`,
    sections,
  ].join('');
}

function scale(colors: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const fallback = token('--muted', '#eceeef');
  for (let i = 0; i < 12; i += 1) {
    out[`cScale${i}`] = colors[i % colors.length] ?? fallback;
    out[`cScaleLabel${i}`] = token('--foreground', '#16181d');
    out[`cScaleInv${i}`] = token('--muted-foreground', '#667078');
  }
  return out;
}

export function studioMermaidConfig(dark: boolean) {
  const background = token('--background', dark ? '#0f1114' : '#f4f5f6');
  const foreground = token('--foreground', dark ? '#ecedef' : '#16181d');
  const muted = token('--muted', dark ? '#1c2025' : '#eceeef');
  const mutedFg = token('--muted-foreground', dark ? '#8a9098' : '#667078');
  const card = token('--card', dark ? '#16191d' : '#fbfbfc');
  const border = token('--border', dark ? '#25282d' : '#e2e4e7');
  const live = token('--live', dark ? '#d4783a' : '#c4622d');
  const chart1 = token('--chart-1', live);
  const chart2 = token('--chart-2', mutedFg);
  const chart4 = token('--chart-4', dark ? '#667078' : '#8a9098');
  const chart5 = token('--chart-5', dark ? '#c4622d' : '#d4783a');
  const primaryFg = token('--primary-foreground', dark ? '#14161a' : '#f6f7f8');
  const destructive = token('--destructive', dark ? '#e06a5e' : '#c23b2e');
  const palette = [
    muted,
    card,
    chart2,
    chart4,
    muted,
    card,
    chart2,
    chart4,
    muted,
    card,
    chart2,
    chart4,
  ];

  return {
    startOnLoad: false as const,
    securityLevel: 'strict' as const,
    theme: 'base' as const,
    look: 'classic' as const,
    fontFamily: 'IBM Plex Sans Variable, IBM Plex Sans, sans-serif',
    // Mindmap branch tints (same #id scope as section fills). Final paint is in JS.
    themeCSS: mindmapThemeCss({
      muted,
      card,
      border,
      foreground,
      mutedFg,
      live,
      tints: [chart1, chart2, chart4, chart5, live, mutedFg],
    }),
    flowchart: {
      htmlLabels: true,
      curve: 'basis' as const,
      padding: 8,
      nodeSpacing: 28,
      rankSpacing: 28,
      diagramPadding: 6,
      wrappingWidth: 160,
      titleTopMargin: 12,
    },
    sequence: {
      diagramMarginX: 16,
      diagramMarginY: 4,
      actorMargin: 20,
      width: 112,
      height: 34,
      boxMargin: 4,
      boxTextMargin: 3,
      noteMargin: 4,
      messageMargin: 12,
      mirrorActors: false,
      actorFontSize: 12,
      noteFontSize: 11,
      messageFontSize: 11,
      wrap: true,
      wrapPadding: 4,
      bottomMarginAdj: 0,
    },
    class: {
      padding: 3,
      textHeight: 10,
      dividerMargin: 4,
      titleTopMargin: 8,
      // Mermaid class renderer v3 reads spacing from `state` (see below).
      nodeSpacing: 20,
      rankSpacing: 24,
    },
    state: {
      padding: 5,
      dividerMargin: 5,
      noteMargin: 5,
      titleTopMargin: 8,
      fontSize: 12,
      labelHeight: 12,
      radius: 4,
      edgeLengthFactor: '12',
      // Used by classDiagram layout (mermaid quirk).
      nodeSpacing: 20,
      rankSpacing: 24,
    },
    er: {
      diagramPadding: 10,
      entityPadding: 8,
      minEntityWidth: 88,
      minEntityHeight: 56,
      nodeSpacing: 72,
      rankSpacing: 48,
      fontSize: 11,
      titleTopMargin: 10,
    },
    gantt: {
      barHeight: 16,
      barGap: 2,
      topPadding: 28,
      rightPadding: 36,
      leftPadding: 56,
      gridLineStartPadding: 20,
      fontSize: 11,
      sectionFontSize: 11,
      titleTopMargin: 12,
      numberSectionStyles: 2,
    },
    mindmap: {
      padding: 6,
      maxNodeWidth: 140,
      useMaxWidth: true,
    },
    pie: {
      textPosition: 0.75,
      useMaxWidth: true,
    },
    themeVariables: {
      darkMode: dark,
      background,
      fontFamily: 'IBM Plex Sans Variable, IBM Plex Sans, sans-serif',
      fontSize: '12px',
      textColor: foreground,
      lineColor: mutedFg,
      mainBkg: muted,
      nodeBorder: border,
      nodeTextColor: foreground,
      clusterBkg: card,
      clusterBorder: border,
      titleColor: foreground,
      edgeLabelBackground: card,
      primaryColor: muted,
      primaryTextColor: foreground,
      primaryBorderColor: border,
      secondaryColor: card,
      secondaryTextColor: foreground,
      secondaryBorderColor: border,
      tertiaryColor: muted,
      tertiaryTextColor: mutedFg,
      tertiaryBorderColor: border,
      useGradient: false,
      actorBkg: muted,
      actorBorder: border,
      actorTextColor: foreground,
      actorLineColor: border,
      signalColor: mutedFg,
      signalTextColor: foreground,
      labelBoxBkgColor: muted,
      labelBoxBorderColor: border,
      labelTextColor: foreground,
      loopTextColor: mutedFg,
      noteBkgColor: card,
      noteTextColor: foreground,
      noteBorderColor: border,
      activationBkgColor: muted,
      activationBorderColor: border,
      sequenceNumberColor: primaryFg,
      sectionBkgColor: muted,
      altSectionBkgColor: card,
      sectionBkgColor2: muted,
      excludeBkgColor: card,
      taskBkgColor: muted,
      taskBorderColor: border,
      taskTextColor: foreground,
      taskTextDarkColor: foreground,
      taskTextLightColor: foreground,
      taskTextOutsideColor: mutedFg,
      taskTextClickableColor: live,
      activeTaskBkgColor: muted,
      activeTaskBorderColor: live,
      gridColor: border,
      todayLineColor: live,
      doneTaskBkgColor: muted,
      doneTaskBorderColor: border,
      critBkgColor: muted,
      critBorderColor: destructive,
      labelColor: foreground,
      ...scale(palette),
      // Never use foreground/background/card as slice fills — labels share one color.
      pie1: chart1,
      pie2: chart2,
      pie3: chart4,
      pie4: chart5,
      pie5: live,
      pie6: mutedFg,
      pie7: chart1,
      pie8: chart4,
      pie9: chart5,
      pie10: chart2,
      pie11: live,
      pie12: mutedFg,
      pieTitleTextSize: '12px',
      pieTitleTextColor: foreground,
      pieSectionTextSize: '11px',
      pieSectionTextColor: foreground,
      pieLegendTextSize: '11px',
      pieLegendTextColor: mutedFg,
      pieStrokeColor: background,
      pieStrokeWidth: '1.5px',
      pieOuterStrokeWidth: '1px',
      pieOuterStrokeColor: border,
      pieOpacity: '0.92',
      git0: muted,
      git1: card,
      git2: chart2,
      git3: chart4,
      git4: muted,
      git5: card,
      git6: chart2,
      git7: chart4,
      gitBranchLabel0: foreground,
      gitBranchLabel1: foreground,
      gitBranchLabel2: foreground,
      gitBranchLabel3: foreground,
      gitBranchLabel4: foreground,
      gitBranchLabel5: foreground,
      gitBranchLabel6: foreground,
      gitBranchLabel7: foreground,
      commitLabelColor: foreground,
      commitLabelBackground: muted,
      commitLabelFontSize: '11px',
      attributeBackgroundColorOdd: card,
      attributeBackgroundColorEven: muted,
      stateBkg: muted,
      stateLabelColor: foreground,
      transitionColor: mutedFg,
      transitionLabelColor: mutedFg,
      compositeBackground: card,
      compositeTitleBackground: muted,
      compositeBorder: border,
      altBackground: muted,
      specialStateColor: mutedFg,
    },
  };
}
