/**
 * Demo data switch. Example data is on unless NEXT_PUBLIC_QEVRA_DEMO_DATA is "off".
 * When it is off the app renders an honest "not connected" state instead of fixtures. There is no live data
 * provider yet: engineering supplies one by implementing AppModelValue (src/types/app-model.ts).
 */
export const DEMO_ENABLED = process.env.NEXT_PUBLIC_QEVRA_DEMO_DATA !== "off";
