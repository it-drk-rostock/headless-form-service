// The bundler loads this stylesheet as text (`bundle.mts`), so the embed can
// add SurveyJS's theme to the page without a second request.
declare module "survey-core/survey-core.min.css" {
  const css: string;
  export default css;
}
