/**
 * Legacy demo-data switch. QEVRA_APP_MODE selects the explicit demo/live provider;
 * this flag only disables demo when the selected mode is demo or unset.
 */
export const DEMO_ENABLED = process.env.NEXT_PUBLIC_QEVRA_DEMO_DATA !== "off";
