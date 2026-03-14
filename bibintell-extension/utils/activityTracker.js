export function trackTab(title, url) {

  const tabData = {
    title: title,
    url: url,
    timestamp: Date.now()
  };

  console.log("Tracking tab:", tabData);

}