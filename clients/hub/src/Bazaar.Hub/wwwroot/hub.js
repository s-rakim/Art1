// Saves a file the server streamed to the page (the payments CSV).
window.hubDownload = async function (name, streamRef) {
  const buffer = await streamRef.arrayBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
