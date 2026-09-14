// Config plugins do Expo são carregados com require na avaliação de app.config.ts,
// então este arquivo precisa ser CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

/**
 * Adota o ciclo de vida de UIScene no template nativo iOS.
 *
 * Apps compilados com o SDK do iOS 27 não lançam sem isso:
 * "UIScene life cycle is required for apps built with this SDK".
 * Expo SDK 57 / React Native 0.86 ainda não adotam cenas
 * (https://github.com/expo/expo/issues/46663), e `apps/mobile/ios/` é gerado,
 * então a adoção precisa viver aqui para sobreviver ao prebuild.
 *
 * Declarar o manifesto sem ligar o delegate troca "não lança" por janela
 * branca, então as duas metades andam juntas neste mesmo plugin.
 */

const SCENE_DELEGATE_CLASS = `
// MARK: - UIScene life cycle
//
// Sob o ciclo de vida de cena, o UIKit para de chamar
// \`application(_:open:options:)\`, \`application(_:continue:restorationHandler:)\`
// e os eventos de foreground/background no app delegate. Os ExpoAppDelegateSubscriber
// de expo-linking, expo-dev-launcher e expo-notifications continuam registrados nesses
// pontos, então este delegate reencaminha cada evento de cena para o app delegate.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    return UIApplication.shared.delegate as? AppDelegate
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      return
    }
    guard let appDelegate, let factory = appDelegate.reactNativeFactory else {
      // Sem factory não há o que colocar na janela. Falhar alto: em silêncio isto
      // vira exatamente a janela branca que este plugin existe para evitar.
      NSLog("[UIScene] reactNativeFactory ausente ao conectar a cena; a janela ficaria vazia.")
      assertionFailure("reactNativeFactory ausente em scene(_:willConnectTo:options:)")
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Bibliotecas que ainda leem \`UIApplication.shared.delegate.window\`.
    appDelegate.window = window

    // React Native lê o deep link de partida a frio e a notificação que abriu o app
    // de \`launchOptions\`. Sob cenas essas informações chegam em \`connectionOptions\`,
    // então elas são recolocadas em launchOptions antes de iniciar o React Native.
    var launchOptions = AppDelegate.sceneLaunchOptions ?? [:]
    // \`urlContexts\` é um Set, que não tem ordem. Ordenar deixa a escolha
    // determinística quando, raramente, chega mais de uma URL na mesma conexão.
    let urlContexts = connectionOptions.urlContexts.sorted { $0.url.absoluteString < $1.url.absoluteString }
    if let url = urlContexts.first?.url {
      launchOptions[.url] = url
    }
    let userActivities = connectionOptions.userActivities.sorted { $0.activityType < $1.activityType }
    if let userActivity = userActivities.first {
      launchOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityKey": userActivity,
        UIApplication.LaunchOptionsKey.userActivityType.rawValue: userActivity.activityType
      ]
    }

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)

    // Consumidas. Se a cena reconectar, o React Native não pode reiniciar com um
    // deep link ou notificação já processados: no retorno de login isso
    // significaria trocar de novo um código de autenticação já gasto.
    AppDelegate.sceneLaunchOptions = nil

    // Reencaminha o que chegou junto com a conexão da cena para os subscribers.
    deliver(urlContexts, to: appDelegate)
    for userActivity in userActivities {
      self.scene(scene, continue: userActivity)
    }
  }

  // Deep link: clubedojogo://auth/callback chega por aqui.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate else {
      return
    }
    deliver(URLContexts.sorted { $0.url.absoluteString < $1.url.absoluteString }, to: appDelegate)
  }

  private func deliver(_ contexts: [UIOpenURLContext], to appDelegate: AppDelegate) {
    for context in contexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [
        .openInPlace: context.options.openInPlace
      ]
      if let sourceApplication = context.options.sourceApplication {
        options[.sourceApplication] = sourceApplication
      }
      if let annotation = context.options.annotation {
        options[.annotation] = annotation
      }
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  // Universal link.
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate else {
      return
    }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity) { _ in }
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }
}
`;

const START_REACT_NATIVE_BLOCK = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;

const STORE_LAUNCH_OPTIONS_BLOCK = `    // A janela passa a ser criada pelo SceneDelegate, quando a cena conecta.
    // Aqui só guardamos as launchOptions, porque o scene delegate não as recebe.
    AppDelegate.sceneLaunchOptions = launchOptions`;

const WINDOW_PROPERTY = `  var window: UIWindow?`;

const WINDOW_PROPERTY_WITH_STORAGE = `  var window: UIWindow?

  /// Guardadas em \`didFinishLaunchingWithOptions\` para o SceneDelegate repassar ao React Native.
  static var sceneLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?`;

const LINKING_ANCHOR = `  // Linking API`;

const SCENE_CONFIGURATION_METHOD = `  // MARK: - Configuring and Discarding Scenes

  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: connectingSceneSession.configuration.name,
      sessionRole: connectingSceneSession.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }

`;

function replaceOnce(contents, needle, replacement, what) {
  const occurrences = contents.split(needle).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `withUISceneLifecycle: esperava exatamente 1 ocorrência de ${what} em AppDelegate.swift, achei ${occurrences}. ` +
        'O template do Expo mudou; revise o plugin antes de compilar, senão o app abre com janela branca.'
    );
  }
  return contents.replace(needle, replacement);
}

const withSceneAppDelegate = (config) =>
  withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error(
        `withUISceneLifecycle: AppDelegate em ${cfg.modResults.language}, o plugin só trata swift.`
      );
    }

    let contents = cfg.modResults.contents;

    if (contents.includes('class SceneDelegate')) {
      return cfg;
    }

    contents = replaceOnce(
      contents,
      START_REACT_NATIVE_BLOCK,
      STORE_LAUNCH_OPTIONS_BLOCK,
      'o bloco que cria a UIWindow e inicia o React Native'
    );
    contents = replaceOnce(
      contents,
      WINDOW_PROPERTY,
      WINDOW_PROPERTY_WITH_STORAGE,
      'a propriedade `var window: UIWindow?`'
    );
    contents = replaceOnce(
      contents,
      LINKING_ANCHOR,
      SCENE_CONFIGURATION_METHOD + LINKING_ANCHOR,
      'o comentário `// Linking API`'
    );

    cfg.modResults.contents = contents.trimEnd() + '\n' + SCENE_DELEGATE_CLASS;
    return cfg;
  });

const withSceneManifest = (config) =>
  withInfoPlist(config, (cfg) => {
    // Sem UISceneDelegateClassName de propósito: quem escolhe a classe é
    // `application(_:configurationForConnecting:options:)`, o que evita depender da
    // substituição de $(PRODUCT_MODULE_NAME) e do name mangling do Swift.
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneClassName: 'UIWindowScene'
          }
        ]
      }
    };
    return cfg;
  });

module.exports = function withUISceneLifecycle(config) {
  return withSceneManifest(withSceneAppDelegate(config));
};
