export function clearReportRecovery() {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index)
      if (key?.startsWith("jota-report-recovery:")) sessionStorage.removeItem(key)
    }
  } catch { /* Browser storage can be disabled. */ }
  window.dispatchEvent(new Event("jota:report-signout"))
}
