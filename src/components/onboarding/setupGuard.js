const SETUP_KEY  = 'fl_setup_v2';
const ONBOARD_KEY = 'fl_onboarded_v1';

export function shouldShowSetup() {
  try {
    return !localStorage.getItem(SETUP_KEY) && !localStorage.getItem(ONBOARD_KEY);
  } catch {
    return false;
  }
}
