// German UI strings. Keys are dotted by area; add new strings here, never inline in components.
export const de = {
  "app.title": "Formular-Service",
  "app.description": "Formulare gestalten, einbetten und als E-Mail empfangen",
  "app.logoTile": "DRK",
  "org.name": "DRK Rostock",

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
  "forms.viewSettings": "Einstellungen",
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
    "Der Entwurf, Fragen und E-Mail-Vorlage, wird als Version {version} gespeichert. Besucher sehen ab sofort diese Version.",
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
  "forms.cancel": "Abbrechen",
  "forms.close": "Schließen",
  "forms.recipients": "Empfänger",
  "forms.recipientsHint":
    "Diese Adressen erhalten jede Einsendung als E-Mail. Eine Adresse pro Zeile, höchstens {maxRecipients}.",
  "forms.recipientsNone":
    "Noch keine Empfänger. Ohne Empfänger werden Einsendungen niemandem zugestellt.",
  "forms.turnstile": "Bot-Schutz (Cloudflare Turnstile)",
  "forms.turnstileHint":
    "Besucher werden vor dem Absenden unauffällig geprüft, ob sie Menschen sind. Nur in Ausnahmefällen ausschalten.",
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
  "forms.errorPublishEmpty":
    "Der Entwurf hat noch keine Fragen. Bitte im Designer mindestens eine Frage anlegen.",
  "forms.errorRecipientInvalid":
    "„{address}“ ist keine gültige E-Mail-Adresse.",
  "forms.errorTooManyRecipients":
    "Höchstens {maxRecipients} Empfänger sind möglich.",
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
  "audit.action.formPublished": "Formular veröffentlicht",
  "audit.summary.formPublished": "{name}: Version {version}",
  "audit.action.settingsOriginsChanged": "Erlaubte Websites geändert",
  "audit.action.settingsLoadLimitChanged": "Aufruf-Limit geändert",
  "audit.action.settingsSubmitLimitChanged": "Einsende-Limit geändert",
  "audit.summary.settingsLoadLimit": "{from} → {to} pro Minute und IP",
  "audit.summary.settingsSubmitLimit": "{from} → {to} pro Stunde und IP",
  "audit.summary.none": "keine",
  "audit.newer": "Neuere",
  "audit.older": "Ältere",
  "audit.pageOf": "Seite {page} von {pages}",
} as const satisfies Record<string, string>;
