/**
 * Conversation navigator stylesheet: theme tokens with neutral fallbacks so
 * both dark and light themes work. Injected as one style tag at apply time
 * and removed with the plugin fiber.
 */
export const STYLE_TEXT = [
  '.dshn-rail{position:fixed;z-index:60;display:flex;flex-direction:column;align-items:center;width:22px;box-sizing:border-box;}',
  '.dshn-markers{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;justify-content:center;align-items:stretch;overflow-y:auto;scrollbar-width:none;}',
  '.dshn-markers::-webkit-scrollbar{display:none}',
  '.dshn-marker{flex:none;height:15px;width:100%;border:none;background:transparent;padding:0;margin:0;cursor:pointer;display:flex;align-items:center;justify-content:flex-start;border-radius:4px;}',
  '.dshn-marker::after{content:"";display:block;width:var(--dshn-w,14px);height:3px;border-radius:2px;background:var(--dsw-alias-label-secondary,#8a8f98);opacity:.38;transition:opacity .15s ease,width .18s ease,background .15s ease;}',
  '.dshn-marker:hover::after,.dshn-marker:focus-visible::after{opacity:1;background:var(--dsw-static-deepseek-500,#2f6fde);}',
  '.dshn-marker:focus-visible{outline:2px solid var(--dsw-alias-border-l2,#8a8f98);outline-offset:-2px;}',
  '.dshn-marker[data-current="1"]::after{opacity:1;width:22px;background:var(--dsw-static-deepseek-500,#2f6fde);}',
  '.dshn-marker[data-status="processing"]::after{opacity:.9;animation:dshn-pulse 1.2s ease-in-out infinite;}',
  '@keyframes dshn-pulse{0%,100%{opacity:.35}50%{opacity:1}}',
  '.dshn-hint{flex:none;align-self:flex-start;height:15px;width:14px;display:flex;flex-direction:row;align-items:center;justify-content:space-between;padding:0;margin:0;}',
  '.dshn-hint span{display:block;width:3px;height:3px;border-radius:50%;background:var(--dsw-static-deepseek-500,#2f6fde);opacity:.38;animation:dshn-pulse 1.2s ease-in-out infinite;}',
  '.dshn-hint span:nth-child(2){animation-delay:.15s}',
  '.dshn-hint span:nth-child(3){animation-delay:.3s}',
  '.dshn-shimmer{font-weight:600;background:linear-gradient(90deg,var(--dsw-static-deepseek-500,#2f6fde) 0%,var(--dsw-static-deepseek-500,#2f6fde) 40%,var(--dsw-static-deepseek-200,#9db9f0) 50%,var(--dsw-static-deepseek-500,#2f6fde) 60%,var(--dsw-static-deepseek-500,#2f6fde) 100%);',
  'background-position:100% 0;background-size:250% 100%;background-clip:text;color:transparent;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:dshn-shimmer 1.8s linear infinite;}',
  '@keyframes dshn-shimmer{to{background-position:0 0}}',
  '.dshn-card{position:fixed;z-index:61;width:290px;max-width:72vw;box-sizing:border-box;padding:10px 12px;border-radius:10px;',
  'background:var(--dsw-alias-bg-layer-2,#ffffff);border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));',
  'box-shadow:0 10px 32px rgba(0,0,0,.18);font-size:12px;line-height:1.55;color:var(--dsw-alias-label-primary,#1f2328);cursor:pointer;}',
  '.dshn-card .dshn-row{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;',
  'overflow-wrap:anywhere;word-break:break-word;color:var(--dsw-alias-label-primary,#1f2328);margin:3px 0 0;font-weight:600;}',
  '.dshn-card .dshn-row-a{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;',
  'overflow-wrap:anywhere;word-break:break-word;color:var(--dsw-alias-label-secondary,#6a737d);margin:3px 0 0;}',
  '.dshn-flash{animation:dshn-flash 1.6s ease-out;}',
  '@keyframes dshn-flash{0%{background:var(--dsw-alias-bg-layer-2,rgba(120,160,255,.16))}100%{background:transparent}}',
  '@media (prefers-reduced-motion: reduce){.dshn-shimmer{animation:none;background-position:0 0;background-size:100% 100%}.dshn-marker::after{transition:none}.dshn-marker[data-status="processing"]::after{animation:none;opacity:1}.dshn-hint span{animation:none}.dshn-flash{animation:none}}',
].join('\n')
