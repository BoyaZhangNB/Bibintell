const startButton = document.getElementById("startSession");

startButton.addEventListener("click", () => {

  const task = document.getElementById("taskInput").value;

  chrome.storage.local.set({
    currentTask: task
  });

  document.getElementById("status").innerText =
    "Session started for: " + task;

});