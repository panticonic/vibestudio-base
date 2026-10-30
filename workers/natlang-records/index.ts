export { NatlangRecordsDO } from "./NatlangRecordsDO.js";

export default {
  async fetch() {
    return new Response(
      "Natlang records service.\nMethods: begin, progress, discard, record, listCalls, getCall, getValue, annotate, feedback, importExamples, tuneExamples, subscribeLive, unsubscribeLive, liveInterest, publishLive.\n",
      { headers: { "Content-Type": "text/plain" } },
    );
  },
};
