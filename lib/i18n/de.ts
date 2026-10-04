// German UI strings. Keys are dotted by area; add new strings here, never inline in components.
export const de = {
  "app.title": "Formular-Service",
  "app.description": "Formulare gestalten, einbetten und als E-Mail empfangen",
  "app.logoTile": "DRK",
  "org.name": "DRK Rostock",

  "nav.forms": "Formulare",
  "nav.teams": "Teams",
  "nav.allForms": "Alle Formulare",
  "nav.allTeams": "Alle Teams",
  "nav.sectionTeams": "Teams",
  "nav.noTeams": "Noch keine Teams",
  "nav.mainLabel": "Module",
  "nav.breadcrumbsLabel": "Brotkrümelnavigation",
  "nav.showSidebar": "Seitenleiste einblenden",
  "nav.hideSidebar": "Seitenleiste ausblenden",
  "nav.toggleSection": "Abschnitt ein- oder ausklappen",

  "forms.title": "Formulare",
  "forms.emptyTitle": "Noch keine Formulare",
  "forms.emptyHint": "Hier erscheinen die Formulare aller eigenen Teams.",

  "teams.title": "Teams",
  "teams.emptyTitle": "Noch keine Teams",
  "teams.emptyHint": "Hier erscheinen alle Teams, denen man angehört.",
} as const satisfies Record<string, string>;
