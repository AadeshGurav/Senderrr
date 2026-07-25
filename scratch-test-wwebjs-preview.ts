const fs = require('fs');

const mockPreview = {
    title: "Test Article Title",
    description: "Test Article Description",
    canonicalUrl: "https://google.com",
    matchedText: "https://google.com",
    preview: true,
    subtype: "url",
};

console.log("Mock preview generated:", mockPreview);
// We know from Utils.js that extraOptions are destructured directly into the message model:
// const message = { ...options, ...extraOptions }
// So if we pass: extra: mockPreview, WWebJS will pass it.
