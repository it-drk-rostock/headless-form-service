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

  "user.menuLabel": "Konto",
  "user.signOut": "Abmelden",

  "auth.loginTitle": "Anmelden",
  "auth.loginIntro": "Zugang nur auf Einladung.",
  "auth.email": "E-Mail-Adresse",
  "auth.password": "Passwort",
  "auth.loginSubmit": "Anmelden",
  "auth.loginHelp":
    "Passwort vergessen? Ein Team-Admin oder Super Admin kann einen neuen Link zum Setzen des Passworts senden.",
  "auth.errorMissingFields": "Bitte E-Mail-Adresse und Passwort eingeben.",
  "auth.errorInvalidCredentials": "E-Mail-Adresse oder Passwort ist falsch.",
  "auth.errorTooManyAttempts":
    "Zu viele Versuche. Bitte in einigen Minuten erneut versuchen.",
  "auth.errorGeneric": "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
  "auth.errorLinkInvalid":
    "Der Link ist ungültig oder abgelaufen. Ein Team-Admin oder Super Admin kann einen neuen senden.",

  "auth.setPasswordTitle": "Passwort festlegen",
  "auth.setPasswordIntro":
    "Angemeldet als {email}. Bitte ein Passwort für die Anmeldung festlegen.",
  "auth.newPassword": "Neues Passwort",
  "auth.newPasswordHint": "Mindestens {min} Zeichen.",
  "auth.confirmPassword": "Passwort wiederholen",
  "auth.setPasswordSubmit": "Passwort speichern",
  "auth.errorPasswordTooShort":
    "Das Passwort muss mindestens {min} Zeichen lang sein.",
  "auth.errorPasswordMismatch": "Die Passwörter stimmen nicht überein.",
  "auth.errorPasswordWeak":
    "Dieses Passwort ist zu schwach. Bitte ein anderes wählen.",
  "auth.errorPasswordSame":
    "Das neue Passwort muss sich vom bisherigen unterscheiden.",
  "auth.errorSetPassword":
    "Das Passwort konnte nicht gespeichert werden. Bitte erneut versuchen.",

  "forms.title": "Formulare",
  "forms.emptyTitle": "Noch keine Formulare",
  "forms.emptyHint": "Hier erscheinen die Formulare aller eigenen Teams.",

  "teams.title": "Teams",
  "teams.emptyTitle": "Noch keine Teams",
  "teams.emptyHint": "Hier erscheinen alle Teams, denen man angehört.",
  "teams.emptyHintSuperAdmin":
    "Hier angelegte Teams erscheinen in dieser Liste.",
  "teams.create": "Team anlegen",
  "teams.createTitle": "Neues Team",
  "teams.createSubmit": "Anlegen",
  "teams.rename": "Umbenennen",
  "teams.renameTitle": "Team umbenennen",
  "teams.renameSubmit": "Speichern",
  "teams.back": "Zurück",
  "teams.close": "Schließen",
  "teams.name": "Name",
  "teams.nameHint": "Zum Beispiel die Abteilung, höchstens {max} Zeichen.",
  "teams.columnName": "Name",
  "teams.columnRole": "Eigene Rolle",
  "teams.columnCreated": "Angelegt",
  "teams.role.team_admin": "Team-Admin",
  "teams.role.member": "Mitglied",
  "teams.roleNone": "Kein Mitglied",
  "teams.detailRole": "Eigene Rolle",
  "teams.detailMembers": "Mitglieder",
  "teams.detailCreated": "Angelegt am",
  "teams.notFoundTitle": "Team nicht gefunden",
  "teams.notFoundHint":
    "Dieses Team gibt es nicht, oder es ist nur für seine Mitglieder sichtbar.",
  "teams.errorNameMissing": "Bitte einen Namen eingeben.",
  "teams.errorNameTooLong": "Der Name darf höchstens {max} Zeichen lang sein.",
  "teams.errorForbidden":
    "Nur Super Admins dürfen Teams anlegen und umbenennen.",
  "teams.errorGeneric":
    "Das Team konnte nicht gespeichert werden. Bitte erneut versuchen.",
} as const satisfies Record<string, string>;
