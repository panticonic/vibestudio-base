---
description: Check the retained scene and notes using the installed tour frame verifier.
args:
  goal: string
  row: WelcomeRow
  scene: TourScene
  sceneCount: number
returns: TourWitness
---
Use the exact observed tour frame and expectedNotes. Form the stop with goal as topic, the supplied canonical scene, and expectedNotes. Call tour.rehearseTour.reviewStops.verifyTourStop with the exact stop, frame and sceneCount. Return those arguments and the unchanged result.
