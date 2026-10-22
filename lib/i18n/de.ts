// German UI strings. Keys are dotted by area; add new strings here, never inline in components.
export const de = {
  "app.title": "Formular-Service",
  "app.description": "Formulare gestalten, einbetten und als E-Mail empfangen",
  "app.logoTile": "DRK",
  "org.name": "DRK Kreisverband Rostock e.V.",

  "nav.forms": "Formulare",
  "nav.teams": "Teams",
  "nav.auditLog": "Audit-Log",
  "nav.settings": "Einstellungen",
  "nav.generalSettings": "Allgemein",
  "nav.allAuditEntries": "Alle Einträge",
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
  "forms.archivedEmptyTitle": "Keine archivierten Formulare",
  "forms.archivedEmptyHint":
    "Hier erscheinen archivierte Formulare aller eigenen Teams. Sie lassen sich jederzeit aus dem Archiv holen.",
  "forms.filterActive": "In Verwendung",
  "forms.filterArchived": "Archiviert",
  "forms.emptyHintNoTeam":
    "Formulare gehören einem Team. Sobald Sie einem Team angehören, können Sie hier Formulare anlegen.",
  "forms.create": "Formular anlegen",
  "forms.createTitle": "Neues Formular",
  "forms.createSubmit": "Anlegen",
  "forms.name": "Name",
  "forms.nameHint":
    "Wie das Formular im Dashboard und in E-Mails heißt, höchstens {max} Zeichen.",
  "forms.team": "Team",
  "forms.teamHint":
    "Das Team, dem das Formular gehört. Nur seine Mitglieder sehen und bearbeiten es.",
  "forms.teamPlaceholder": "Team wählen",
  "forms.columnName": "Name",
  "forms.columnTeam": "Team",
  "forms.columnStatus": "Status",
  "forms.columnUpdated": "Geändert",
  "forms.status.draft": "Entwurf",
  "forms.status.published": "Veröffentlicht",
  "forms.status.closed": "Geschlossen",
  "forms.status.archived": "Archiviert",
  "forms.settingsTitle": "Einstellungen",
  "forms.viewDesigner": "Designer",
  "forms.viewEmail": "E-Mail",
  "forms.viewVersions": "Versionen",
  "forms.viewSettings": "Einstellungen",
  "forms.viewEmbed": "Embed",
  "forms.embedTitle": "Formular einbetten",
  "forms.hostedPage": "Formularseite im Formular-Service",
  "forms.hostedHint":
    "Dieses Formular kann auch direkt im Formular-Service ausgefüllt werden. Die App-Adresse muss in den erlaubten Ursprüngen stehen; bei Turnstile muss auch der App-Hostname freigegeben sein. Für geschützte Formulare diese Adresse als Formularseite speichern und einen Pass-Link erstellen.",
  "forms.hostedNoScript":
    "Bitte JavaScript aktivieren, um dieses Formular auszufüllen.",
  "forms.embedHint":
    "Diesen Code als HTML-Inhalt auf der Formularseite einfügen. Er zeigt immer die aktuell veröffentlichte Version.",
  "forms.embedSnippet": "HTML-Code",
  "forms.embedCopy": "Code kopieren",
  "forms.embedCopied": "Kopiert",
  "forms.embedPage": "Externe Formularseite",
  "forms.embedNoPage":
    "Noch keine Formularseite hinterlegt. Die Adresse kann in den Einstellungen eingetragen werden.",
  "forms.embedOriginHint":
    "Der Ursprung der Formularseite muss in den globalen Einstellungen erlaubt sein. Das Skript muss unter der angegebenen Dashboard-Adresse öffentlich erreichbar sein.",
  "forms.embedPublicHint":
    "Dieses Formular ist öffentlich. Die Formularseite kann ohne Pass geteilt werden.",
  "forms.embedProtectedHint":
    "Dieses Formular ist geschützt. Besucher benötigen einen Link mit gültigem Pass aus dem Tab „Pässe“.",
  "forms.viewPasses": "Pässe",
  "forms.viewStatistics": "Statistik",
  "forms.viewFailures": "Fehler",
  "settings.globalTheme": "Globales Formulardesign (SurveyJS JSON)",
  "audit.action.settingsThemeChanged": "Globales Formulardesign geändert",
  "audit.summary.settingsThemeCleared":
    "Das globale Formulardesign wurde entfernt.",
  "audit.summary.settingsThemeSaved":
    "Das globale Formulardesign wurde gespeichert.",
  "settings.globalThemeHint":
    "Gilt beim nächsten Laden für Formulare ohne eigenes Design. Leer lassen und speichern, um das Standarddesign zu verwenden.",
  "settings.clearTheme": "Design entfernen",
  "settings.errorThemeJson":
    "Das Design enthält ungültiges JSON. Bitte die JSON-Syntax prüfen.",
  "settings.errorThemeInvalid":
    "Bitte ein SurveyJS-Designobjekt mit gültigen Eigenschaften, Typen und Werten eingeben (z. B. cssVariables mit CSS-Variablen und Textwerten).",
  "forms.themeChoice": "Formulardesign",
  "forms.themeInherit": "Standarddesign übernehmen",
  "forms.themeCustom": "Eigenes Formulardesign",
  "forms.themeInheritHint":
    "Das Standarddesign wird übernommen. Wählen Sie ein eigenes Design, um es anzupassen.",
  "forms.themeCustomHint":
    "Änderungen werden automatisch im Entwurf gespeichert und erst durch Veröffentlichen sichtbar.",
  "forms.themeSaveFailed":
    "Das Formulardesign konnte nicht gespeichert werden. Bitte erneut versuchen.",
  "forms.themeRetry": "Design erneut speichern",
  "forms.designerHint":
    "Änderungen werden automatisch im Entwurf gespeichert. Besucher sehen sie erst nach dem Veröffentlichen.",
  "forms.draftNeverSaved": "Entwurf noch nicht gespeichert",
  "forms.draftSaved": "Entwurf gespeichert am {at}",
  "forms.draftSavedBy": "Entwurf gespeichert am {at} von {by}",
  "forms.emailHint":
    "Änderungen werden automatisch im Entwurf gespeichert. Empfänger erhalten die neue Vorlage erst nach dem Veröffentlichen.",
  "forms.emailMode": "Vorlage",
  "forms.emailModeStandard": "Standard-Layout",
  "forms.emailModeCustom": "Eigenes HTML",
  "forms.emailModeStandardHint":
    "Das Layout des DRK Rostock, gestaltet wird nur der Inhalt.",
  "forms.emailModeCustomHint":
    "Die ganze E-Mail als eigenes HTML. Eingefügte Werte werden immer maskiert.",
  "forms.emailHtml": "HTML",
  "forms.emailHtmlHint":
    "Wird so versendet, wie es hier steht; nur die Platzhalter werden ersetzt.",
  "forms.emailSwitchStandardTitle": "Zum Standard-Layout wechseln?",
  "forms.emailSwitchStandardText":
    "Das eigene HTML wird verworfen. Im Standard-Layout steht wieder der Inhalt von vor dem Wechsel, nach einem Neuladen der Seite der Standardinhalt.",
  "forms.emailSwitchStandardSubmit": "HTML verwerfen und wechseln",
  "forms.emailSubject": "Betreff",
  "forms.emailSubjectHint": "Reiner Text, höchstens {max} Zeichen.",
  "forms.emailBody": "Inhalt",
  "forms.emailBodyHint":
    "Erscheint im Standard-Layout des DRK Rostock, zwischen Kopf- und Fußzeile.",
  "forms.emailInsert": "Platzhalter einfügen",
  "forms.emailInsertHint":
    "Fügt an der zuletzt gewählten Stelle im Betreff oder Inhalt ein.",
  "forms.emailInsertQuestions": "Antworten",
  "forms.emailInsertNoQuestions": "Der Entwurf hat noch keine Fragen.",
  "forms.emailInsertGeneral": "Allgemein",
  "forms.emailInsertPass": "Formularpass",
  "forms.emailInsertNoPassKeys":
    "Die Formularpässe dieses Formulars haben noch keine Metadaten.",
  "forms.emailInsertPassHint":
    "Weitere Schlüssel als {{pass.<schlüssel>}} eintippen. Hat der Formularpass einer Einsendung den Schlüssel nicht, bleibt die Stelle leer.",
  "forms.emailPlaceholderFormName": "Name des Formulars",
  "forms.emailPlaceholderSubmittedAt": "Zeitpunkt der Einsendung",
  "forms.emailPlaceholderAnswersTable": "Alle Antworten als Tabelle",
  "forms.emailAnswersTable": "Antworttabelle einfügen",
  "forms.emailUnknownTitle": "Unbekannte Platzhalter",
  "forms.emailUnknownHint":
    "Diese Platzhalter werden nicht ersetzt und erscheinen unverändert in der E-Mail. Bitte korrigieren oder entfernen.",
  "forms.emailUnknownSubject": "Betreff:",
  "forms.emailUnknownBody": "Inhalt:",
  "forms.emailPreview": "Vorschau",
  "forms.emailPreviewHint":
    "Mit Beispielantworten, so wie die E-Mail bei den Empfängern ankommt.",
  "forms.emailPreviewPassHint":
    "Mit Beispielantworten und Beispielwerten für Formularpass-Metadaten, so wie die E-Mail bei den Empfängern ankommt.",
  "forms.emailPreviewFrame": "Vorschau der Benachrichtigungs-E-Mail",
  "editor.bold": "Fett",
  "editor.italic": "Kursiv",
  "editor.underline": "Unterstrichen",
  "editor.h2": "Überschrift",
  "editor.h3": "Zwischenüberschrift",
  "editor.bulletList": "Aufzählung",
  "editor.orderedList": "Nummerierte Liste",
  "editor.link": "Link einfügen",
  "editor.unlink": "Link entfernen",
  "editor.hr": "Trennlinie",
  "editor.undo": "Rückgängig",
  "editor.redo": "Wiederholen",
  "editor.linkUrl": "Adresse des Links",
  "editor.linkExample": "https://www.drk-rostock.de",
  "editor.linkExternal": "Link öffnet in einem neuen Tab",
  "editor.linkInternal": "Link öffnet im selben Tab",
  "editor.linkSave": "Übernehmen",
  "forms.notPublished": "Noch nicht veröffentlicht",
  "forms.notPublishedHint":
    "Besucher sehen das Formular erst nach dem ersten Veröffentlichen.",
  "forms.version": "Version {version}",
  "forms.publishedVersion": "Version {version}, veröffentlicht am {at}",
  "forms.publishedVersionBy":
    "Version {version}, veröffentlicht am {at} von {by}",
  "forms.publish": "Veröffentlichen",
  "forms.publishTitle": "Entwurf veröffentlichen",
  "forms.publishText":
    "Der Entwurf mit Fragen, E-Mail-Vorlage und Formulardesign wird als Version {version} gespeichert. Besucher sehen ab sofort diese Version.",
  "forms.publishWaitsForSave":
    "Der Entwurf hat Änderungen, die noch nicht gespeichert sind. Veröffentlichen ist möglich, sobald sie gespeichert sind.",
  "forms.publishNoRecipients":
    "Dieses Formular hat noch keine Empfänger. Einsendungen werden erst zugestellt, wenn unter Einstellungen Empfänger eingetragen sind.",
  "forms.changelog": "Änderungsnotiz",
  "forms.changelogHint":
    "Optional. Was sich gegenüber der vorigen Version geändert hat, höchstens {max} Zeichen.",
  "forms.publishSubmit": "Veröffentlichen",
  "forms.published":
    "Version {version} ist veröffentlicht. Besucher sehen ab sofort diese Version.",
  "forms.versionsHint":
    "Wiederherstellen übernimmt Fragen, E-Mail-Vorlage und Formulardesign einer Version in den Entwurf. Besucher sehen sie erst, wenn der Entwurf als neue Version veröffentlicht ist.",
  "forms.versionsEmptyTitle": "Noch keine Versionen",
  "forms.versionsEmptyHint":
    "Jedes Veröffentlichen legt eine neue Version an. Hier lassen sie sich ansehen und wiederherstellen.",
  "forms.columnVersion": "Version",
  "forms.columnPublishedAt": "Veröffentlicht am",
  "forms.columnPublishedBy": "Von",
  "forms.columnChangelog": "Änderungsnotiz",
  "forms.versionCurrent": "Aktuell",
  "forms.versionNoChangelog": "Keine Änderungsnotiz",
  "forms.versionPublisherUnknown": "Unbekannt",
  "forms.restore": "Wiederherstellen",
  "forms.restoreTitle": "Version {version} wiederherstellen",
  "forms.restoreText":
    "Fragen, E-Mail-Vorlage und Formulardesign der Version {version} ersetzen den Entwurf. Änderungen im Entwurf, die noch nicht veröffentlicht sind, gehen dabei verloren. Besucher sehen weiter Version {current}, bis der Entwurf veröffentlicht ist.",
  "forms.restoreSubmit": "Wiederherstellen",
  "forms.restored":
    "Version {version} ist jetzt im Entwurf. Veröffentlicht wird sie als Version {next}.",
  "forms.discard": "Änderungen verwerfen",
  "forms.discardTitle": "Änderungen verwerfen",
  "forms.discardText":
    "Fragen, E-Mail-Vorlage und Formulardesign im Entwurf werden auf die aktuelle Version {version} zurückgesetzt. Alle Änderungen seit dem letzten Veröffentlichen gehen verloren.",
  "forms.discardSubmit": "Änderungen verwerfen",
  "forms.discarded": "Der Entwurf entspricht wieder Version {version}.",
  "forms.resetWaitsForSave":
    "Der Entwurf hat Änderungen, die noch nicht gespeichert sind. Das ist möglich, sobald sie gespeichert sind.",
  "forms.cancel": "Abbrechen",
  "forms.close": "Schließen",
  "forms.recipients": "Empfänger",
  "forms.recipientsHint":
    "Diese Adressen erhalten jede Einsendung als E-Mail. Eine Adresse pro Zeile, höchstens {maxRecipients}.",
  "forms.recipientsNone":
    "Noch keine Empfänger. Ohne Empfänger werden Einsendungen niemandem zugestellt.",
  "forms.closed": "Formular geschlossen",
  "forms.closedHint":
    "Besucher sehen statt des Formulars einen Hinweis, dass es derzeit geschlossen ist, und können nichts einsenden. Bereits angenommene Einsendungen werden weiter zugestellt.",
  "forms.turnstile": "Bot-Schutz (Cloudflare Turnstile)",
  "forms.turnstileHint":
    "Besucher werden vor dem Absenden unauffällig geprüft, ob sie Menschen sind. Nur in Ausnahmefällen ausschalten.",
  "forms.access": "Zugang",
  "forms.accessHint":
    "Ein öffentliches Formular kann jeder ausfüllen. Ein geschütztes nur, wer einen gültigen Link mit Pass hat; Pässe werden unter „Pässe“ angelegt.",
  "forms.accessPublic": "Öffentlich",
  "forms.accessProtected": "Geschützt",
  "forms.page": "Formularseite",
  "forms.pageHint":
    "Die Seite der Website, auf der das Formular eingebettet ist. Aus ihr entstehen die Links der Pässe.",
  "forms.senderName": "Absendername",
  "forms.senderNameHint":
    "Erscheint in E-Mails zu diesem Formular neben der Absenderadresse, höchstens {max} Zeichen. Leer: „{default}“.",
  "forms.replyTo": "Antworten an",
  "forms.replyToHint":
    "Die Antwort auf diese E-Mail-Frage wird Antwortadresse der E-Mail, wenn sie eine gültige E-Mail-Adresse ist. So kann direkt der Person geantwortet werden, die das Formular ausgefüllt hat.",
  "forms.replyToNone": "Keine Antwortadresse",
  "forms.replyToUnpublished":
    "Wählbar, sobald das Formular veröffentlicht ist: aus den E-Mail-Fragen der aktuellen Version.",
  "forms.replyToNoEmailQuestions":
    "Die aktuelle Version hat keine E-Mail-Frage (Textfeld mit Eingabetyp E-Mail).",
  "forms.replyToMissing": "{name} (nicht in der aktuellen Version)",
  "forms.replyToMissingHint":
    "Die gewählte Frage gibt es in der aktuellen Version nicht mehr. Neue Einsendungen beantworten sie nicht, ihre E-Mails haben dann keine Antwortadresse. Bitte eine andere Frage wählen.",
  "forms.save": "Speichern",
  "forms.saved": "Gespeichert.",
  "forms.detailTeam": "Team",
  "forms.detailStatus": "Status",
  "forms.detailCreated": "Angelegt am",
  "forms.detailVersion": "Aktuelle Version",
  "forms.archivedNotice":
    "Archiviert am {at}. Das Formular wird nicht mehr geladen und nimmt keine Einsendungen an. Versionen und Statistik bleiben erhalten.",
  "forms.passesTitle": "Pässe",
  "forms.passesHint":
    "Mit einem Pass kann ein geschütztes Formular ausgefüllt werden: über den Link aus Formularseite und Pass. Ein Pass gilt, bis er widerrufen, aufgebraucht oder abgelaufen ist.",
  "forms.passesPublicTitle": "Öffentliches Formular",
  "forms.passesPublicHint":
    "Pässe braucht nur ein geschütztes Formular. Der Zugang wird in den Einstellungen geändert.",
  "forms.passesNoPage":
    "Noch keine Formularseite. Pässe lassen sich anlegen, sobald sie in den Einstellungen eingetragen ist.",
  "forms.passesEmptyTitle": "Noch keine Pässe",
  "forms.passesEmptyHint": "Hier erscheinen die Pässe dieses Formulars.",
  "forms.passCreate": "Pass anlegen",
  "forms.passCreateTitle": "Neuer Pass",
  "forms.passCreateSubmit": "Anlegen",
  "forms.passMaxUses": "Nutzungslimit",
  "forms.passMaxUsesHint":
    "Wie oft mit diesem Pass eingesendet werden kann, höchstens {max}. Leer: unbegrenzt bis zum Ablauf.",
  "forms.passExpiry": "Gültig für (Stunden)",
  "forms.passExpiryHint":
    "Ab jetzt, höchstens {max} Stunden (ein Jahr). Leer: läuft nicht ab.",
  "forms.passMetadata": "Metadaten",
  "forms.passMetadataHint":
    "Kontext für die E-Mail, z. B. eine Ticket- oder Kampagnen-ID, als Platzhalter {{pass.<Schlüssel>}}. Keine personenbezogenen Daten eintragen.",
  "forms.passMetadataKey": "Schlüssel",
  "forms.passMetadataValue": "Wert",
  "forms.passMetadataAdd": "Eintrag hinzufügen",
  "forms.passMetadataRemove": "Eintrag entfernen",
  "forms.passCreated": "Pass angelegt",
  "forms.passCreatedHint":
    "Der Link wird nur jetzt angezeigt. Bitte kopieren und weitergeben; später lässt er sich nicht mehr anzeigen.",
  "forms.passLink": "Link mit Pass",
  "forms.passCopy": "Kopieren",
  "forms.passCopied": "Kopiert",
  "forms.passDone": "Fertig",
  "forms.columnPassCreated": "Angelegt",
  "forms.columnPassUses": "Nutzungen",
  "forms.columnPassExpires": "Gültig bis",
  "forms.columnPassMetadata": "Metadaten",
  "forms.columnPassStatus": "Status",
  "forms.passUses": "{used} von {max}",
  "forms.passUsesUnlimited": "{used} von unbegrenzt",
  "forms.passNoExpiry": "Unbegrenzt",
  "forms.passNoMetadata": "–",
  "forms.passBy": "von {by}",
  "forms.passSourceN8n": "über n8n",
  "forms.passStatus.valid": "Gültig",
  "forms.passStatus.used_up": "Aufgebraucht",
  "forms.passStatus.expired": "Abgelaufen",
  "forms.passStatus.revoked": "Widerrufen",
  "forms.passRevoke": "Widerrufen",
  "forms.passRevokeTitle": "Pass widerrufen",
  "forms.passRevokeText":
    "Der Pass wird sofort und endgültig ungültig. Wer den Link hat, kann das Formular damit nicht mehr ausfüllen. Bereits angenommene Einsendungen werden weiter zugestellt.",
  "forms.statisticsTitle": "Statistik",
  "forms.statisticsPeriod.1": "Heute",
  "forms.statisticsPeriod.7": "7 Tage",
  "forms.statisticsPeriod.30": "30 Tage",
  "forms.statisticsPeriod.90": "90 Tage",
  "forms.statisticsPeriodLabel": "Zeitraum",
  "forms.statisticsHint":
    "Gezählt werden angenommene Einsendungen und Aufrufe des Formulars, nach deutscher Zeit. Aufrufe werden nur pro Tag gezählt. Antworten werden nicht gespeichert und fließen nicht ein.",
  "forms.statisticsSubmissions": "Einsendungen",
  "forms.statisticsLoads": "Aufrufe",
  "forms.statisticsConversion": "Konversion",
  "forms.statisticsConversionHint": "Einsendungen je Aufruf",
  "forms.statisticsDelivery": "Zustellung",
  "forms.statisticsDeliveryHint": "{sent} versendet, {failed} fehlgeschlagen",
  "forms.statisticsSent": "Versendet",
  "forms.statisticsFailed": "Fehlgeschlagen",
  "forms.statisticsQueued": "Unterwegs",
  "forms.statisticsNone": "–",
  "forms.statisticsByHour": "Einsendungen pro Stunde",
  "forms.statisticsByDay": "Einsendungen pro Tag",
  "forms.statisticsChartLabel": "{title}, {from} bis {to}",
  "forms.statisticsLoadsByDay": "Aufrufe pro Tag",
  "forms.statisticsHour": "{hour} Uhr",
  "forms.statisticsDay": "{day}.{month}.",
  "forms.statisticsDate": "{day}.{month}.{year}",
  "forms.statisticsDateHour": "{date}, {hour}",
  "forms.statisticsPointSubmissions": "{count} Einsendungen",
  "forms.statisticsPointLoads": "{count} Aufrufe",
  "forms.statisticsColumnTime": "Zeit",
  "forms.statisticsVersionsTitle": "Einsendungen pro Version",
  "forms.statisticsColumnVersion": "Version",
  "forms.statisticsVersion": "Version {version}",
  "forms.statisticsColumnShare": "Anteil",
  "forms.statisticsEmptyTitle": "Noch keine Daten",
  "forms.statisticsEmptyHint":
    "In diesem Zeitraum wurde das Formular weder aufgerufen noch abgeschickt.",
  "forms.failuresTitle": "Zustellfehler",
  "forms.failuresHint":
    "Einsendungen, deren Benachrichtigungs-E-Mail auch nach allen Wiederholungen nicht versendet werden konnte. Die Antworten werden nicht gespeichert und hier nie angezeigt. QStash bewahrt sie verschlüsselt {days} Tage lang auf; so lange lässt sich die Zustellung wiederholen.",
  "forms.failuresEmptyTitle": "Keine Zustellfehler",
  "forms.failuresEmptyHint":
    "Alle angenommenen Einsendungen dieses Formulars wurden zugestellt oder sind unterwegs.",
  "forms.columnFailureSubmitted": "Eingegangen",
  "forms.columnFailureVersion": "Version",
  "forms.columnFailureReason": "Grund",
  "forms.columnFailureStatus": "Status",
  "forms.failureVersion": "Version {version}",
  "forms.failureNoReason": "–",
  "forms.failureStatus.failed": "Fehlgeschlagen",
  "forms.failureStatus.in_progress": "Wird erneut zugestellt",
  "forms.failureRetry": "Zustellung wiederholen",
  "forms.failureRetryExpired":
    "Nicht mehr möglich: QStash bewahrt fehlgeschlagene Zustellungen nur {days} Tage auf. Diese Einsendung lässt sich nicht mehr zustellen.",
  "forms.failureRetryGone":
    "Nicht mehr möglich: Die Nachricht ist nicht mehr bei QStash (abgelaufen oder entfernt). Diese Einsendung lässt sich nicht mehr zustellen.",
  "forms.errorRetryNotPossible":
    "Diese Zustellung lässt sich nicht wiederholen. Bitte die Seite neu laden.",
  "forms.errorRetryUnrecorded":
    "Die Zustellung wurde erneut gestartet, konnte aber nicht vermerkt werden. Bitte nicht noch einmal wiederholen; die Einsendung verschwindet aus der Liste, sobald die E-Mail versendet ist.",
  "forms.errorRetryFailed":
    "Die Zustellung konnte gerade nicht wiederholt werden. Bitte später erneut versuchen.",
  "forms.lifecycleTitle": "Archivieren und löschen",
  "forms.archive": "Archivieren",
  "forms.archiveHint":
    "Für Formulare, die nicht mehr gebraucht werden: Sie verschwinden aus der Formularliste, die Einbettung zeigt nichts mehr an, und Einsendungen werden abgelehnt. Versionen und Statistik bleiben erhalten. Das lässt sich rückgängig machen.",
  "forms.archiveTitle": "Formular archivieren",
  "forms.archiveText":
    "„{name}“ wird archiviert. Die Einbettung zeigt das Formular nicht mehr an, und Einsendungen werden abgelehnt, bis es aus dem Archiv geholt wird. Bereits angenommene Einsendungen werden weiter zugestellt.",
  "forms.unarchive": "Aus dem Archiv holen",
  "forms.unarchiveHint":
    "Das Formular ist archiviert. Aus dem Archiv geholt, erscheint es wieder in der Formularliste, und die Einbettung zeigt sofort wieder die aktuelle Version.",
  "forms.unarchiveTitle": "Formular aus dem Archiv holen",
  "forms.unarchiveText":
    "„{name}“ erscheint wieder in der Formularliste. Ist es veröffentlicht, wird es sofort wieder geladen und nimmt Einsendungen an.",
  "forms.delete": "Endgültig löschen",
  "forms.deleteHint":
    "Nur für Super Admins. Löscht das Formular mit allen Versionen und der Statistik. Das lässt sich nicht rückgängig machen; die Einträge im Audit-Log bleiben.",
  "forms.deleteTitle": "Formular endgültig löschen",
  "forms.deleteText":
    "„{name}“ wird mit allen Versionen und der Statistik gelöscht. Das lässt sich nicht rückgängig machen. Einsendungen, die noch nicht zugestellt sind, werden nicht mehr zugestellt.",
  "forms.deleteConfirm": "Zur Bestätigung den Namen des Formulars eingeben",
  "forms.notFoundTitle": "Formular nicht gefunden",
  "forms.notFoundHint":
    "Dieses Formular gibt es nicht, oder es ist nur für die Mitglieder seines Teams sichtbar.",
  "forms.errorNameMissing": "Bitte einen Namen eingeben.",
  "forms.errorNameTooLong": "Der Name darf höchstens {max} Zeichen lang sein.",
  "forms.errorTeamMissing": "Bitte ein Team wählen.",
  "forms.errorSenderNameTooLong":
    "Der Absendername darf höchstens {maxSenderName} Zeichen lang sein.",
  "forms.errorReplyToInvalid":
    "Als Antwortadresse ist nur eine E-Mail-Frage der aktuellen Version wählbar.",
  "forms.errorDraftInvalid":
    "Der Entwurf ist ungültig und konnte nicht gespeichert werden.",
  "forms.errorDraftQuestionType":
    "Datei- und Unterschriftsfragen sind nicht erlaubt. Bitte entfernen und erneut speichern.",
  "forms.errorEmailInvalid":
    "Die E-Mail-Vorlage ist ungültig und konnte nicht gespeichert werden.",
  "forms.errorEmailSubjectMissing": "Bitte einen Betreff eingeben.",
  "forms.errorEmailSubjectTooLong":
    "Der Betreff darf höchstens {max} Zeichen lang sein.",
  "forms.errorEmailBodyTooLong":
    "Der Inhalt darf höchstens {max} Zeichen lang sein.",
  "forms.errorChangelogTooLong":
    "Die Änderungsnotiz darf höchstens {max} Zeichen lang sein.",
  "forms.errorVersionNotFound": "Diese Version gibt es nicht.",
  "forms.errorDeleteConfirm":
    "Der eingegebene Name stimmt nicht mit dem Namen des Formulars überein.",
  "forms.errorDeleteForbidden":
    "Nur Super Admins dürfen Formulare endgültig löschen.",
  "forms.errorFormGone": "Dieses Formular gibt es nicht mehr.",
  "forms.errorDiscardUnpublished":
    "Das Formular ist noch nicht veröffentlicht. Es gibt keine Version, auf die der Entwurf zurückgesetzt werden kann.",
  "forms.errorPublishEmpty":
    "Der Entwurf hat noch keine Fragen. Bitte im Designer mindestens eine Frage anlegen.",
  "forms.errorRecipientInvalid":
    "„{address}“ ist keine gültige E-Mail-Adresse.",
  "forms.errorRecipientDomainNotAllowed":
    "„{address}“ gehört zu keiner erlaubten Empfänger-Domain. Einsendungen dürfen nicht an private Postfächer gehen; weitere Domains gibt ein Super Admin in den Einstellungen frei.",
  "forms.errorTooManyRecipients":
    "Höchstens {maxRecipients} Empfänger sind möglich.",
  "forms.errorPageInvalid":
    "Die Formularseite muss eine Web-Adresse sein, die mit https:// oder http:// beginnt.",
  "forms.errorPassMaxUses":
    "Das Nutzungslimit muss eine ganze Zahl von 1 bis {maxUses} sein, oder leer für unbegrenzt.",
  "forms.errorPassExpiry":
    "Die Gültigkeit muss eine ganze Zahl von 1 bis {maxHours} Stunden sein, oder leer für unbegrenzt.",
  "forms.errorPassMetadataKey":
    "Schlüssel der Metadaten dürfen nur Buchstaben ohne Umlaute, Ziffern, _ und - enthalten, höchstens 50 Zeichen.",
  "forms.errorPassMetadataDuplicate":
    "Jeder Schlüssel darf nur einmal vorkommen.",
  "forms.errorPassMetadataValueTooLong":
    "Werte der Metadaten dürfen höchstens {maxValue} Zeichen lang sein.",
  "forms.errorPassMetadataTooMany":
    "Höchstens {maxEntries} Metadaten sind möglich.",
  "forms.errorPassNotProtected":
    "Pässe gibt es nur für geschützte Formulare. Bitte erst in den Einstellungen den Zugang auf „Geschützt“ stellen.",
  "forms.errorPassNoPage":
    "Bitte erst in den Einstellungen die Formularseite eintragen.",
  "forms.errorForbidden":
    "Nur Mitglieder des Teams und Super Admins dürfen seine Formulare anlegen und ändern.",
  "forms.errorGeneric":
    "Das Formular konnte nicht gespeichert werden. Bitte erneut versuchen.",

  "settings.title": "Einstellungen",
  "settings.intro":
    "Gelten für alle Formulare und wirken sofort, ohne neues Deployment. Nur Super Admins sehen und ändern sie; jede Änderung steht im Audit-Log.",
  "settings.origins": "Erlaubte Websites",
  "settings.originsHint":
    "Nur Seiten dieser Adressen dürfen Formulare einbetten und absenden. Eine Adresse pro Zeile, mit https:// und ohne Pfad, z. B. https://www.drk-rostock.de. Höchstens {maxOrigins}.",
  "settings.originsNone":
    "Keine Website ist erlaubt. Eingebettete Formulare lassen sich nirgends laden.",
  "settings.recipientDomains": "Erlaubte Empfänger-Domains",
  "settings.recipientDomainsHint":
    "Formulare senden nur an Adressen dieser Domains, damit Einsendungen nicht in private Postfächer gehen. Eine Domain pro Zeile, z. B. drk-rostock.de. Eine Subdomain wie kv.drk-rostock.de braucht eine eigene Zeile. Höchstens {maxDomains}.",
  "settings.recipientDomainsNone":
    "Keine Domain ist erlaubt. Formulare können keine Empfänger speichern und versenden keine E-Mails.",
  "settings.loadRateLimit": "Aufrufe pro Minute und IP-Adresse",
  "settings.loadRateLimitHint":
    "So oft darf eine IP-Adresse pro Minute ein Formular laden. Darüber erhält sie „Zu viele Versuche“.",
  "settings.submitRateLimit": "Einsendungen pro Stunde und IP-Adresse",
  "settings.submitRateLimitHint":
    "So oft darf eine IP-Adresse pro Stunde absenden. Besucher hinter einer gemeinsamen IP-Adresse (z. B. ein Büronetz) teilen sich dieses Limit.",
  "settings.save": "Speichern",
  "settings.saved": "Gespeichert. Die Änderungen gelten ab sofort.",
  "settings.errorOriginInvalid":
    "„{origin}“ ist keine gültige Website-Adresse. Bitte nur http:// oder https://, den Domainnamen und optional einen Port angeben, ohne Pfad.",
  "settings.errorTooManyOrigins":
    "Höchstens {maxOrigins} erlaubte Websites sind möglich.",
  "settings.errorRecipientDomainInvalid":
    "„{domain}“ ist keine gültige Domain. Bitte nur den Domainnamen angeben, z. B. drk-rostock.de, ohne https:// und ohne den Teil vor dem @.",
  "settings.errorTooManyRecipientDomains":
    "Höchstens {maxDomains} erlaubte Empfänger-Domains sind möglich.",
  "settings.errorLoadRateLimitInvalid":
    "Bitte für die Aufrufe eine ganze Zahl von {min} bis {max} eingeben.",
  "settings.errorSubmitRateLimitInvalid":
    "Bitte für die Einsendungen eine ganze Zahl von {min} bis {max} eingeben.",
  "settings.errorForbidden":
    "Nur Super Admins dürfen die Einstellungen ändern.",
  "settings.errorGeneric":
    "Die Einstellungen konnten nicht gespeichert werden. Bitte erneut versuchen.",

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

  "members.title": "Mitglieder",
  "members.empty": "Dieses Team hat noch keine Mitglieder.",
  "members.noTeamAdmin":
    "Dieses Team hat keinen Team-Admin. Nur Super Admins können seine Mitglieder verwalten.",
  "members.columnName": "Name",
  "members.columnEmail": "E-Mail-Adresse",
  "members.columnRole": "Rolle",
  "members.columnSince": "Mitglied seit",
  "members.you": "Sie",
  "members.actionsLabel": "Aktionen für {name}",
  "members.invite": "Mitglied einladen",
  "members.inviteTitle": "Mitglied einladen",
  "members.inviteIntro":
    "Gibt es noch kein Konto mit dieser Adresse, wird eines angelegt und eine Einladung per E-Mail gesendet. Bestehende Konten werden ohne E-Mail hinzugefügt.",
  "members.email": "E-Mail-Adresse",
  "members.fullName": "Name",
  "members.fullNameHint":
    "Optional. Wird nur für neue Konten übernommen und in der Mitgliederliste angezeigt.",
  "members.role": "Rolle",
  "members.roleHint.team_admin":
    "Kann Mitglieder einladen, Rollen ändern, Mitglieder entfernen und Links zum Passwort senden.",
  "members.roleHint.member": "Kann die Formulare des Teams bearbeiten.",
  "members.inviteSubmit": "Einladen",
  "members.invited": "Die Einladung wurde an {email} gesendet.",
  "members.added":
    "{email} hat bereits ein Konto und wurde ohne E-Mail zum Team hinzugefügt.",
  "members.inviteAnother": "Weitere Person einladen",
  "members.cancel": "Abbrechen",
  "members.done": "Schließen",
  "members.makeAdmin": "Zum Team-Admin machen",
  "members.makeAdminText":
    "{name} kann dann Mitglieder dieses Teams einladen, Rollen ändern und Mitglieder entfernen.",
  "members.makeMember": "Zum Mitglied machen",
  "members.makeMemberText":
    "{name} kann dann keine Mitglieder dieses Teams mehr verwalten.",
  "members.sendPasswordLink": "Link zum Passwort senden",
  "members.sendPasswordLinkText":
    "{email} erhält eine E-Mail mit einem Link, über den ein neues Passwort festgelegt wird. Der Link ist 24 Stunden gültig. Das bisherige Passwort bleibt gültig, bis ein neues festgelegt ist.",
  "members.sendPasswordLinkSubmit": "Link senden",
  "members.passwordLinkSent": "Der Link wurde an {email} gesendet.",
  "members.remove": "Aus dem Team entfernen",
  "members.removeText":
    "{name} verliert den Zugriff auf dieses Team und seine Formulare. Das Konto bleibt bestehen.",
  "members.removeSelfText":
    "Sie verlieren damit selbst den Zugriff auf dieses Team und seine Formulare.",
  "members.removeSubmit": "Entfernen",
  "members.lastAdminBlocked":
    "{name} ist der letzte Team-Admin. Ein Team braucht mindestens einen Team-Admin, machen Sie also zuerst jemand anderen zum Team-Admin.",
  "members.lastAdminOverride":
    "{name} ist der letzte Team-Admin. Danach hat das Team keinen Team-Admin mehr, und nur Super Admins können seine Mitglieder verwalten.",
  "members.errorEmailMissing": "Bitte eine E-Mail-Adresse eingeben.",
  "members.errorEmailInvalid": "Bitte eine gültige E-Mail-Adresse eingeben.",
  "members.errorFullNameTooLong":
    "Der Name darf höchstens {max} Zeichen lang sein.",
  "members.errorAlreadyMember": "{email} ist bereits Mitglied dieses Teams.",
  "members.errorForbidden":
    "Nur Team-Admins dieses Teams und Super Admins dürfen Mitglieder verwalten.",
  "members.errorNotMember": "Diese Person ist nicht (mehr) Mitglied des Teams.",
  "members.errorLastTeamAdmin":
    "Ein Team braucht mindestens einen Team-Admin. Machen Sie zuerst jemand anderen zum Team-Admin.",
  "members.errorTooManyEmails":
    "Gerade wurden zu viele E-Mails gesendet. Bitte in einigen Minuten erneut versuchen.",
  "members.errorGeneric": "Das hat nicht geklappt. Bitte erneut versuchen.",

  "audit.title": "Audit-Log",
  "audit.intro":
    "Sicherheitsrelevante Änderungen aller Teams, neueste zuerst. Einträge lassen sich nicht bearbeiten oder löschen.",
  "audit.teamIntro":
    "Sicherheitsrelevante Änderungen in diesem Team, neueste zuerst. Nur für Team-Admins und Super Admins sichtbar.",
  "audit.empty": "Noch keine Einträge.",
  "audit.columnTime": "Zeitpunkt",
  "audit.columnTeam": "Team",
  "audit.columnActor": "Durch",
  "audit.columnAction": "Aktion",
  "audit.columnDetails": "Details",
  "audit.actorSystem": "System",
  "audit.deletedAccount": "Gelöschtes Konto",
  "audit.deletedTeam": "Gelöschtes Team",
  "audit.noTeam": "–",
  "audit.action.memberAdded": "Mitglied hinzugefügt",
  "audit.action.memberRoleChanged": "Rolle geändert",
  "audit.action.memberRemoved": "Mitglied entfernt",
  "audit.summary.memberAdded": "{who} als {role}",
  "audit.summary.memberRoleChanged": "{who}: {from} → {to}",
  "audit.summary.memberRemoved": "{who} ({role})",
  "audit.action.formCreated": "Formular angelegt",
  "audit.action.formRenamed": "Formular umbenannt",
  "audit.action.formRecipientsChanged": "Empfänger geändert",
  "audit.summary.formCreated": "{name}",
  "audit.summary.formRenamed": "{from} → {to}",
  "audit.summary.formRecipientsChanged": "{name}: {changes}",
  "audit.action.formTurnstileChanged": "Bot-Schutz geändert",
  "audit.summary.formTurnstileOn": "{name}: eingeschaltet",
  "audit.summary.formTurnstileOff": "{name}: ausgeschaltet",
  "audit.action.formReplyToChanged": "Antwortadresse geändert",
  "audit.action.formSenderNameChanged": "Absendername geändert",
  "audit.summary.formSettingChanged": "{name}: {from} → {to}",
  "audit.action.formClosed": "Formular geschlossen",
  "audit.action.formReopened": "Formular wieder geöffnet",
  "audit.action.formArchived": "Formular archiviert",
  "audit.action.formUnarchived": "Formular aus dem Archiv geholt",
  "audit.action.formDeleted": "Formular endgültig gelöscht",
  "audit.action.formAccessChanged": "Zugang geändert",
  "audit.summary.formAccessPublic": "{name}: öffentlich",
  "audit.summary.formAccessProtected": "{name}: geschützt",
  "audit.action.formPageChanged": "Formularseite geändert",
  "audit.action.formPassCreated": "Pass angelegt",
  "audit.summary.formPassCreated": "{name}: {uses}, {expiry}",
  "audit.summary.formPassCreatedN8n": "{name}: {uses}, {expiry}, über n8n",
  "audit.summary.formPassUses": "{max} Nutzung(en)",
  "audit.summary.formPassUnlimited": "unbegrenzte Nutzungen",
  "audit.summary.formPassExpires": "gültig bis {at}",
  "audit.summary.formPassNoExpiry": "ohne Ablauf",
  "audit.action.formPassRevoked": "Pass widerrufen",
  "audit.action.deliveryRetried": "Zustellung wiederholt",
  "audit.action.deliveryRetryUnavailable": "Zustellung nicht mehr wiederholbar",
  "audit.summary.delivery": "{name}: Version {version}, eingegangen am {at}",
  "audit.action.formPublished": "Formular veröffentlicht",
  "audit.summary.formPublished": "{name}: Version {version}",
  "audit.action.formVersionRestored": "Version wiederhergestellt",
  "audit.summary.formVersionRestored":
    "{name}: Version {version} in den Entwurf übernommen",
  "audit.action.formDraftDiscarded": "Änderungen verworfen",
  "audit.summary.formDraftDiscarded":
    "{name}: Entwurf auf Version {version} zurückgesetzt",
  "audit.action.settingsOriginsChanged": "Erlaubte Websites geändert",
  "audit.action.settingsRecipientDomainsChanged":
    "Erlaubte Empfänger-Domains geändert",
  "audit.action.settingsLoadLimitChanged": "Aufruf-Limit geändert",
  "audit.action.settingsSubmitLimitChanged": "Einsende-Limit geändert",
  "audit.summary.settingsLoadLimit": "{from} → {to} pro Minute und IP",
  "audit.summary.settingsSubmitLimit": "{from} → {to} pro Stunde und IP",
  "audit.summary.none": "keine",
  "audit.newer": "Neuere",
  "audit.older": "Ältere",
  "audit.pageOf": "Seite {page} von {pages}",
} as const satisfies Record<string, string>;
