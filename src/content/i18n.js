export const LANGUAGES = Object.freeze(['en', 'zh', 'fr', 'es', 'pt']);
export const DEFAULT_LANGUAGE = 'zh';
export const LANGUAGE_LABELS = Object.freeze({ en: 'English', zh: '中文', fr: 'Français', es: 'Español', pt: 'Português' });

const en = Object.freeze({
  toolbarTitle: 'CrashBridge',
  toolbarNotice: 'Real Firebase console compatibility unverified; only the currently rendered event is captured.',
  addSelected: 'Add selected to list',
  openManager: 'Open manager',
  cancelResolve: 'Cancel resolve',
  selectedCount: count => `${count} selected`,
  selectFirst: 'Select issues first',
  listChanged: 'List changed; refresh and select again',
  addFailed: 'Add failed',
  connectionLost: 'Extension connection lost; reload the extension and refresh Firebase',
  resolving: 'Resolving…',
  resolved: 'Resolve finished',
  added: 'added',
  duplicates: 'duplicates',
  failed: 'failed',
  waitingLoad: 'Waiting for page load (up to 60 s)',
  waitingDom: 'Waiting for detail DOM',
  saveFailed: 'Result not saved',
  captureFailed: code => `Capture failed: ${code}`,
  savingResult: 'Saving capture…',
  resultSaved: 'Capture saved',
  unsupportedNavigation: 'Capture identity changed; retry in a new tab',
  managerTitle: 'CrashBridge · Local log workbench',
  localOnly: 'Processed locally only · no auto upload',
});

const zh = Object.freeze({
  toolbarTitle: 'CrashBridge',
  toolbarNotice: '真实 Firebase 控制台兼容性未验证；仅采集当前已渲染事件。',
  addSelected: '将勾选问题加入清单',
  openManager: '打开管理页',
  cancelResolve: '取消解析',
  selectedCount: count => `已选 ${count} 条`,
  selectFirst: '请先勾选要处理的问题',
  listChanged: '列表已变化，请刷新后重新选择',
  addFailed: '加入失败',
  connectionLost: '扩展连接已失效，请重新加载扩展并刷新 Firebase',
  resolving: '正在解析…',
  resolved: '解析结束',
  added: '新增',
  duplicates: '重复',
  failed: '失败',
  waitingLoad: '等待页面加载完成（最多 60 秒）',
  waitingDom: '等待详情 DOM',
  saveFailed: '采集结果未保存',
  captureFailed: code => `采集失败：${code}`,
  savingResult: '正在保存采集结果…',
  resultSaved: '采集结果已保存',
  unsupportedNavigation: '采集身份已改变，请在新标签页重试',
  managerTitle: 'CrashBridge · 本地日志工作台',
  localOnly: '仅在本机处理 · 不自动上传',
});

const fr = Object.freeze({
  toolbarTitle: 'CrashBridge',
  toolbarNotice: 'Compatibilité console Firebase non vérifiée ; seul l\u2019événement affiché est capturé.',
  addSelected: 'Ajouter la sélection à la liste',
  openManager: 'Ouvrir le gestionnaire',
  cancelResolve: 'Annuler la résolution',
  selectedCount: count => `${count} sélectionné(s)`,
  selectFirst: 'Sélectionnez d\u2019abord des problèmes',
  listChanged: 'Liste modifiée ; actualisez et resélectionnez',
  addFailed: 'Échec de l\u2019ajout',
  connectionLost: 'Connexion perdue ; rechargez l\u2019extension puis Firebase',
  resolving: 'Résolution…',
  resolved: 'Résolution terminée',
  added: 'ajoutés',
  duplicates: 'doublons',
  failed: 'échoués',
  waitingLoad: 'Attente du chargement (60 s max)',
  waitingDom: 'Attente du DOM détaillé',
  saveFailed: 'Résultat non enregistré',
  captureFailed: code => `Échec : ${code}`,
  savingResult: 'Enregistrement…',
  resultSaved: 'Résultat enregistré',
  unsupportedNavigation: 'Identité modifiée ; réessayez dans un nouvel onglet',
  managerTitle: 'CrashBridge · Journal local',
  localOnly: 'Traitement local uniquement · aucun envoi',
});

const es = Object.freeze({
  toolbarTitle: 'CrashBridge',
  toolbarNotice: 'Compatibilidad con la consola Firebase no verificada; solo se captura el evento mostrado.',
  addSelected: 'Añadir selección a la lista',
  openManager: 'Abrir gestor',
  cancelResolve: 'Cancelar resolución',
  selectedCount: count => `${count} seleccionado(s)`,
  selectFirst: 'Seleccione problemas primero',
  listChanged: 'Lista modificada; actualice y vuelva a seleccionar',
  addFailed: 'Error al añadir',
  connectionLost: 'Conexión perdida; recargue la extensión y Firebase',
  resolving: 'Resolviendo…',
  resolved: 'Resolución terminada',
  added: 'añadidos',
  duplicates: 'duplicados',
  failed: 'fallidos',
  waitingLoad: 'Esperando carga (máx. 60 s)',
  waitingDom: 'Esperando DOM de detalle',
  saveFailed: 'Resultado no guardado',
  captureFailed: code => `Fallo: ${code}`,
  savingResult: 'Guardando…',
  resultSaved: 'Resultado guardado',
  unsupportedNavigation: 'Identidad modificada; reintente en una pestaña nueva',
  managerTitle: 'CrashBridge · Registro local',
  localOnly: 'Solo procesamiento local · sin subidas',
});

const pt = Object.freeze({
  toolbarTitle: 'CrashBridge',
  toolbarNotice: 'Compatibilidade com o console Firebase não verificada; apenas o evento exibido é capturado.',
  addSelected: 'Adicionar seleção à lista',
  openManager: 'Abrir gestor',
  cancelResolve: 'Cancelar resolução',
  selectedCount: count => `${count} selecionado(s)`,
  selectFirst: 'Selecione problemas primeiro',
  listChanged: 'Lista alterada; atualize e selecione novamente',
  addFailed: 'Falha ao adicionar',
  connectionLost: 'Conexão perdida; recarregue a extensão e o Firebase',
  resolving: 'Resolvendo…',
  resolved: 'Resolução concluída',
  added: 'adicionados',
  duplicates: 'duplicados',
  failed: 'falhas',
  waitingLoad: 'Aguardando carregamento (máx. 60 s)',
  waitingDom: 'Aguardando DOM de detalhe',
  saveFailed: 'Resultado não salvo',
  captureFailed: code => `Falha: ${code}`,
  savingResult: 'Salvando…',
  resultSaved: 'Resultado salvo',
  unsupportedNavigation: 'Identidade alterada; tente em uma nova aba',
  managerTitle: 'CrashBridge · Registro local',
  localOnly: 'Processamento apenas local · sem envio',
});

export const STRINGS = Object.freeze({ en, zh, fr, es, pt });

const managerEn = Object.freeze({
  title: 'CrashBridge · Local log workbench', h1: 'Local log workbench', localOnly: 'Processed locally only · no auto upload',
  compatTitle: 'Compatibility unverified',
  compatWarning: 'Real Firebase console compatibility is unverified: tested only against synthetic samples; it may not match your page.',
  privacyTitle: 'Check sensitive data before sharing',
  privacyWarning: 'Automatic privacy cleanup does not cover all sensitive information. Toggling fields only affects export, not local storage; review manually before sharing.',
  privacyNote: 'Events may retain device, OS and statistics locally even when not exported below. Use “Clear local data” to remove the list and captures; downloaded files must be deleted manually.',
  section01: '01 / Collect & organize', section01H2: 'Accumulate across pages, organize once',
  section01P: 'Select issues on the Firebase Android list and add them, then return here to capture.',
  refresh: 'Refresh status',
  statsLabel: 'Capture overview', total: 'Total', succeeded: 'Captured', pending: 'Pending', problems: 'Failed / interrupted',
  queueH2: 'Issue list', readingState: 'Reading local state…', limit: 'Up to 100 issues',
  progress: 'Local list processing progress',
  start: 'Start capture', retry: 'Retry failed', cancelBtn: 'Cancel capture', clear: 'Clear local data',
  hintStart: 'Starts pending / cancelled items; succeeded items are kept and not re-captured. To re-capture a succeeded item, remove it and re-add from the list. Use “Retry failed” for failures.',
  emptyTitle: 'The list is empty',
  emptyP1: 'Open a logged-in Firebase Crashlytics Android issue list, select loaded issues and add them. Keep adding across filters and pages.',
  emptyP2: 'No selection checkboxes? Check the extension is enabled with Firebase single-site access, then refresh. Still missing may mean an unsupported layout; do not grant all-sites permission.',
  queueLabel: 'Added issues',
  section02: '02 / Review & export', section02H2: 'What you see is what you download',
  section02P: 'The entire list is exported, including failed / unfinished entries. Errors, identities and completeness warnings are always kept.',
  fieldsLegend: 'Download fields (applies to both JSON and Markdown)',
  fieldStack: 'Stack trace', fieldVersion: 'App version', fieldDevice: 'Device / OS', fieldStats: 'Statistics',
  previewFormat: 'Preview format', previewMarkdown: 'Markdown (plain text)', noPreview: 'No preview yet', previewInitial: 'Add issues to see the export preview.',
  downloadJson: 'Download JSON', downloadMarkdown: 'Download Markdown',
  downloadNote: 'You download explicitly; success shows only after the browser confirms completion. Keep this page open during download.',
  footer: 'Only the currently displayed representative event is read; not guaranteed latest and does not cover all events, variants or threads. Firebase issue state is never modified.',
  emptyState: '—',
});

const managerZh = Object.freeze({
  title: 'CrashBridge · 本地日志工作台', h1: '本地日志工作台', localOnly: '仅在本机处理 · 不自动上传',
  compatTitle: '兼容性未验证',
  compatWarning: '真实 Firebase 控制台兼容性未验证：仅通过合成样本测试，不代表已适配你的页面。',
  privacyTitle: '分享前，先检查敏感信息',
  privacyWarning: '自动隐私清理不保证覆盖全部敏感信息。关闭字段只影响导出，不删除本地暂存；分享前请人工检查。',
  privacyNote: '事件可能暂存设备、系统与统计信息，即使下方不导出。使用“清空本地数据”删除清单和捕获内容；已下载文件需自行删除。',
  section01: '01 / 收集与整理', section01H2: '跨页累积，一次整理',
  section01P: '先在 Firebase Android 问题列表勾选并加入清单，再回到这里主动采集。',
  refresh: '刷新状态',
  statsLabel: '采集概览', total: '清单总数', succeeded: '已取得', pending: '待采集', problems: '失败 / 中断',
  queueH2: '问题清单', readingState: '正在读取本地状态…', limit: '最多 100 个问题',
  progress: '本地清单处理进度',
  start: '开始采集', retry: '重试失败项', cancelBtn: '取消采集', clear: '清空本地数据',
  hintStart: '开始处理待采集 / 已取消项；成功项保留、不重复采集。要重新采集成功项，请先删除该项，再从列表重新添加。失败项请用“重试失败项”。',
  emptyTitle: '清单还是空的',
  emptyP1: '打开已登录的 Firebase Crashlytics Android 问题列表，勾选当前已加载的问题并加入清单。可跨筛选、分页继续累积。',
  emptyP2: '没有选择入口？请检查扩展已启用并有 Firebase 单站点访问权限，刷新列表。仍不可用可能是页面布局不受支持；不要授予全站权限。',
  queueLabel: '已添加的问题',
  section02: '02 / 检查与导出', section02H2: '你看到的，就是将下载的内容',
  section02P: '导出整个清单，包含失败 / 未完成条目。错误、标识与完整性警告始终保留。',
  fieldsLegend: '下载字段（JSON 与 Markdown 同步生效）',
  fieldStack: '异常堆栈', fieldVersion: '应用版本', fieldDevice: '设备 / 系统', fieldStats: '聚合统计',
  previewFormat: '预览格式', previewMarkdown: 'Markdown（纯文本）', noPreview: '尚无预览', previewInitial: '加入问题后可查看导出预览。',
  downloadJson: '下载 JSON', downloadMarkdown: '下载 Markdown',
  downloadNote: '由你主动下载；浏览器确认完成后才显示成功。下载期间请勿关闭此页。',
  footer: '只读取当前展示的一个代表事件，不保证最新，也不覆盖所有事件、变体或线程。不会修改 Firebase 问题状态。',
  emptyState: '—',
});

const managerFr = Object.freeze({
  title: 'CrashBridge · Journal local', h1: 'Journal local', localOnly: 'Traitement local uniquement · aucun envoi',
  compatTitle: 'Compatibilité non vérifiée',
  compatWarning: 'Compatibilité console Firebase non vérifiée : testée uniquement sur échantillons synthétiques ; peut ne pas correspondre à votre page.',
  privacyTitle: 'Vérifiez les données sensibles avant partage',
  privacyWarning: 'Le nettoyage automatique ne couvre pas toutes les informations sensibles. Désactiver un champ n\u2019affecte que l\u2019export, pas le stockage local ; vérifiez manuellement avant de partager.',
  privacyNote: 'Les événements peuvent conserver appareil, OS et statistiques localement même non exportés. Utilisez « Effacer les données locales » ; les fichiers téléchargés sont à supprimer manuellement.',
  section01: '01 / Collecter et organiser', section01H2: 'Cumulez entre pages, organisez une fois',
  section01P: 'Sélectionnez des problèmes dans la liste Firebase Android puis revenez ici pour capturer.',
  refresh: 'Actualiser',
  statsLabel: 'Aperçu', total: 'Total', succeeded: 'Capturés', pending: 'En attente', problems: 'Échecs / interrompus',
  queueH2: 'Liste des problèmes', readingState: 'Lecture de l\u2019état local…', limit: 'Jusqu\u2019à 100 problèmes',
  progress: 'Progression de la liste locale',
  start: 'Démarrer', retry: 'Réessayer les échecs', cancelBtn: 'Annuler', clear: 'Effacer les données',
  hintStart: 'Traite les éléments en attente / annulés ; les réussis sont conservés. Pour recapturer un élément réussi, supprimez-le puis réajoutez-le.',
  emptyTitle: 'La liste est vide',
  emptyP1: 'Ouvrez une liste Crashlytics Android connectée, cochez des problèmes et ajoutez-les.',
  emptyP2: 'Pas de cases ? Vérifiez que l\u2019extension est activée avec l\u2019accès Firebase, puis actualisez.',
  queueLabel: 'Problèmes ajoutés',
  section02: '02 / Vérifier et exporter', section02H2: 'Ce que vous voyez est ce que vous téléchargez',
  section02P: 'Toute la liste est exportée, y compris les échecs. Erreurs et avertissements toujours conservés.',
  fieldsLegend: 'Champs téléchargés (JSON et Markdown)',
  fieldStack: 'Trace de pile', fieldVersion: 'Version', fieldDevice: 'Appareil / OS', fieldStats: 'Statistiques',
  previewFormat: 'Format', previewMarkdown: 'Markdown (texte)', noPreview: 'Pas encore d\u2019aperçu', previewInitial: 'Ajoutez des problèmes pour voir l\u2019aperçu.',
  downloadJson: 'Télécharger JSON', downloadMarkdown: 'Télécharger Markdown',
  downloadNote: 'Téléchargement explicite ; succès affiché après confirmation du navigateur.',
  footer: 'Seul l\u2019événement affiché est lu ; pas garanti le plus récent. L\u2019état Firebase n\u2019est jamais modifié.',
  emptyState: '—',
});

const managerEs = Object.freeze({
  title: 'CrashBridge · Registro local', h1: 'Registro local', localOnly: 'Solo procesamiento local · sin envío',
  compatTitle: 'Compatibilidad no verificada',
  compatWarning: 'Compatibilidad con la consola Firebase no verificada: probada solo con muestras sintéticas; puede no coincidir con su página.',
  privacyTitle: 'Revise datos sensibles antes de compartir',
  privacyWarning: 'La limpieza automática no cubre toda la información sensible. Desactivar campos solo afecta la exportación, no el almacenamiento local; revise manualmente.',
  privacyNote: 'Los eventos pueden conservar dispositivo, SO y estadísticas localmente aunque no se exporten. Use «Borrar datos locales»; los archivos descargados elimínelos manualmente.',
  section01: '01 / Recopilar y organizar', section01H2: 'Acumule entre páginas, organice una vez',
  section01P: 'Seleccione problemas en la lista Firebase Android y vuelva aquí para capturar.',
  refresh: 'Actualizar',
  statsLabel: 'Resumen', total: 'Total', succeeded: 'Capturados', pending: 'Pendientes', problems: 'Fallidos / interrumpidos',
  queueH2: 'Lista de problemas', readingState: 'Leyendo estado local…', limit: 'Hasta 100 problemas',
  progress: 'Progreso de la lista local',
  start: 'Iniciar captura', retry: 'Reintentar fallidos', cancelBtn: 'Cancelar', clear: 'Borrar datos locales',
  hintStart: 'Procesa pendientes / cancelados; los exitosos se conservan. Para recapturar, elimine y vuelva a añadir.',
  emptyTitle: 'La lista está vacía',
  emptyP1: 'Abra una lista Crashlytics Android con sesión, marque problemas y añádalos.',
  emptyP2: '¿Sin casillas? Verifique que la extensión está activada con acceso a Firebase, luego actualice.',
  queueLabel: 'Problemas añadidos',
  section02: '02 / Revisar y exportar', section02H2: 'Lo que ve es lo que descarga',
  section02P: 'Se exporta toda la lista, incluidos fallos. Errores y avisos siempre se conservan.',
  fieldsLegend: 'Campos descargados (JSON y Markdown)',
  fieldStack: 'Traza', fieldVersion: 'Versión', fieldDevice: 'Dispositivo / SO', fieldStats: 'Estadísticas',
  previewFormat: 'Formato', previewMarkdown: 'Markdown (texto)', noPreview: 'Sin vista previa', previewInitial: 'Añada problemas para ver la vista previa.',
  downloadJson: 'Descargar JSON', downloadMarkdown: 'Descargar Markdown',
  downloadNote: 'Descarga explícita; el éxito se muestra tras la confirmación del navegador.',
  footer: 'Solo se lee el evento mostrado; no garantizado el más reciente. El estado de Firebase nunca se modifica.',
  emptyState: '—',
});

const managerPt = Object.freeze({
  title: 'CrashBridge · Registro local', h1: 'Registro local', localOnly: 'Processamento apenas local · sem envio',
  compatTitle: 'Compatibilidade não verificada',
  compatWarning: 'Compatibilidade com o console Firebase não verificada: testada apenas com amostras sintéticas; pode não corresponder à sua página.',
  privacyTitle: 'Verifique dados sensíveis antes de compartilhar',
  privacyWarning: 'A limpeza automática não cobre todas as informações sensíveis. Desativar campos afeta apenas a exportação, não o armazenamento local; revise manualmente.',
  privacyNote: 'Eventos podem reter dispositivo, SO e estatísticas localmente mesmo não exportados. Use «Limpar dados locais»; arquivos baixados exclua manualmente.',
  section01: '01 / Coletar e organizar', section01H2: 'Acumule entre páginas, organize uma vez',
  section01P: 'Selecione problemas na lista Firebase Android e volte aqui para capturar.',
  refresh: 'Atualizar',
  statsLabel: 'Visão geral', total: 'Total', succeeded: 'Capturados', pending: 'Pendentes', problems: 'Falhas / interrompidos',
  queueH2: 'Lista de problemas', readingState: 'Lendo estado local…', limit: 'Até 100 problemas',
  progress: 'Progresso da lista local',
  start: 'Iniciar captura', retry: 'Tentar novamente', cancelBtn: 'Cancelar', clear: 'Limpar dados locais',
  hintStart: 'Processa pendentes / cancelados; bem-sucedidos são mantidos. Para recapturar, remova e readicione.',
  emptyTitle: 'A lista está vazia',
  emptyP1: 'Abra uma lista Crashlytics Android conectada, marque problemas e adicione.',
  emptyP2: 'Sem caixas? Verifique se a extensão está ativa com acesso Firebase, depois atualize.',
  queueLabel: 'Problemas adicionados',
  section02: '02 / Revisar e exportar', section02H2: 'O que você vê é o que baixa',
  section02P: 'Toda a lista é exportada, incluindo falhas. Erros e avisos sempre mantidos.',
  fieldsLegend: 'Campos baixados (JSON e Markdown)',
  fieldStack: 'Stack trace', fieldVersion: 'Versão', fieldDevice: 'Dispositivo / SO', fieldStats: 'Estatísticas',
  previewFormat: 'Formato', previewMarkdown: 'Markdown (texto)', noPreview: 'Sem prévia', previewInitial: 'Adicione problemas para ver a prévia.',
  downloadJson: 'Baixar JSON', downloadMarkdown: 'Baixar Markdown',
  downloadNote: 'Download explícito; sucesso mostrado após confirmação do navegador.',
  footer: 'Apenas o evento exibido é lido; não garantido o mais recente. O estado do Firebase nunca é modificado.',
  emptyState: '—',
});

export const MANAGER_STRINGS = Object.freeze({ en: managerEn, zh: managerZh, fr: managerFr, es: managerEs, pt: managerPt });

export function mt(language, key) {
  return MANAGER_STRINGS[LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE][key] ?? MANAGER_STRINGS[DEFAULT_LANGUAGE][key];
}

const statuses = {
  en: { pending: 'Pending', collecting: 'Capturing', succeeded: 'Captured', failed: 'Failed', cancelled: 'Cancelled / interrupted' },
  zh: { pending: '待采集', collecting: '采集中', succeeded: '已取得', failed: '失败', cancelled: '已取消 / 中断' },
  fr: { pending: 'En attente', collecting: 'Capture', succeeded: 'Capturé', failed: 'Échec', cancelled: 'Annulé / interrompu' },
  es: { pending: 'Pendiente', collecting: 'Capturando', succeeded: 'Capturado', failed: 'Fallido', cancelled: 'Cancelado / interrumpido' },
  pt: { pending: 'Pendente', collecting: 'Capturando', succeeded: 'Capturado', failed: 'Falha', cancelled: 'Cancelado / interrompido' },
};
const errors = {
  en: {
    unsupported: 'Page layout or address unsupported; do not treat as capture success.', 'login-required': 'Login expired; sign in to Firebase manually and retry.',
    timeout: 'Capture timed out (60 s); check network / proxy and retry.', 'tab-closed': 'Capture tab was closed; retry failed items.',
    'missing-stack': 'No stack trace obtained; capture failed.', cancelled: 'Capture cancelled or interrupted; start again to continue.',
    'storage-failed': 'Local save failed: results may not be persisted. If capture is active, cancel first and wait for cleanup, then export a backup.',
    'download-failed': 'Download failed or rejected. List and preview kept; allow downloads and retry.',
  },
  zh: {
    unsupported: '页面布局或地址不受支持，请勿将其视为采集成功。', 'login-required': '登录已失效，请在 Firebase 手动登录后重试。',
    timeout: '采集超时（60 秒），请检查网络 / 代理后重试。', 'tab-closed': '采集标签页被关闭，可重试失败项。',
    'missing-stack': '未取得堆栈，本项采集失败。', cancelled: '采集已取消或中断，开始采集可继续处理。',
    'storage-failed': '本地保存失败：当前结果可能尚未持久化，请勿关闭管理页。若采集仍活动，请先取消并等待临时页清理完成，再导出备份。',
    'download-failed': '下载失败或被拒绝。清单与预览已保留，请允许下载后重试。',
  },
  fr: {
    unsupported: 'Mise en page non prise en charge ; ne pas considérer comme un succès.', 'login-required': 'Session expirée ; reconnectez-vous à Firebase puis réessayez.',
    timeout: 'Délai dépassé (60 s) ; vérifiez le réseau puis réessayez.', 'tab-closed': 'Onglet fermé ; réessayez les échecs.',
    'missing-stack': 'Trace non obtenue ; échec.', cancelled: 'Capture annulée ou interrompue ; relancez pour continuer.',
    'storage-failed': 'Échec d\u2019enregistrement local : résultats possiblement non persistés. Annulez d\u2019abord si une capture est active.',
    'download-failed': 'Échec du téléchargement. Liste et aperçu conservés ; autorisez puis réessayez.',
  },
  es: {
    unsupported: 'Diseño no compatible; no lo considere un éxito.', 'login-required': 'Sesión caducada; inicie sesión en Firebase y reintente.',
    timeout: 'Tiempo agotado (60 s); revise la red y reintente.', 'tab-closed': 'Pestaña cerrada; reintente los fallidos.',
    'missing-stack': 'Traza no obtenida; fallo.', cancelled: 'Captura cancelada o interrumpida; reinicie para continuar.',
    'storage-failed': 'Fallo al guardar localmente: resultados posiblemente no persistidos. Cancele primero si hay captura activa.',
    'download-failed': 'Fallo de descarga. Lista y vista previa conservadas; permita descargas y reintente.',
  },
  pt: {
    unsupported: 'Layout não suportado; não considere como sucesso.', 'login-required': 'Sessão expirada; entre no Firebase e tente novamente.',
    timeout: 'Tempo esgotado (60 s); verifique a rede e tente novamente.', 'tab-closed': 'Aba fechada; tente novamente as falhas.',
    'missing-stack': 'Stack não obtida; falha.', cancelled: 'Captura cancelada ou interrompida; reinicie para continuar.',
    'storage-failed': 'Falha ao salvar localmente: resultados possivelmente não persistidos. Cancele primeiro se houver captura ativa.',
    'download-failed': 'Falha no download. Lista e prévia mantidas; permita downloads e tente novamente.',
  },
};

export function statusText(language, status) {
  return statuses[LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE][status] ?? status;
}

export function errorTextFor(language, code, message) {
  const bundle = errors[LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE];
  const base = bundle[code] ?? bundle.unsupported ?? code;
  return message ? `${base} (${message})` : base;
}

export function confirmClearText(language) {
  return language === 'zh' ? '清空全部本地清单与捕获内容？此操作不可撤销，不会删除已经下载的文件。'
    : language === 'fr' ? 'Effacer toute la liste et les captures ? Irréversible ; les fichiers téléchargés ne sont pas supprimés.'
    : language === 'es' ? '¿Borrar toda la lista y capturas? Irreversible; los archivos descargados no se eliminan.'
    : language === 'pt' ? 'Apagar toda a lista e capturas? Irreversível; arquivos baixados não são excluídos.'
    : 'Clear the entire local list and captures? This cannot be undone; downloaded files are not removed.';
}

export function t(language, key, ...args) {
  const bundle = STRINGS[LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE];
  const value = bundle[key] ?? STRINGS[DEFAULT_LANGUAGE][key];
  return typeof value === 'function' ? value(...args) : value;
}

export async function readLanguage(get) {
  const stored = await get('crashbridge-language');
  const value = stored?.['crashbridge-language'];
  return LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE;
}

export async function writeLanguage(set, language) {
  if (!LANGUAGES.includes(language)) throw new Error('Unsupported language');
  await set({ 'crashbridge-language': language });
}
