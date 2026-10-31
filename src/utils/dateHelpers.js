/**
 * Dynamic Thursday Reference Helper
 * Returns natural, Nigerian-tailored temporal phrasing for weekly Thursday CDS promotion batches.
 * 
 * @param {Date} date 
 * @returns {string} e.g. "tomorrow Thursday!", "next tomorrow Thursday!", "next Thursday!"
 */
export function getThursdayReference(date = new Date()) {
  const day = date.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  switch (day) {
    case 2: // Tuesday
      return 'next tomorrow Thursday!';
    case 3: // Wednesday
      return 'tomorrow Thursday!';
    case 4: // Thursday (today is Thursday, next promotion cohort is next week)
    case 5: // Friday
    case 6: // Saturday
      return 'next Thursday!';
    case 0: // Sunday
      return 'this coming Thursday!';
    case 1: // Monday
    default:
      return 'this Thursday!';
  }
}

export default {
  getThursdayReference
};
