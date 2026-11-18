/** Testbestanden (alleen voor tests): kleine GPX/TCX/FIT met een bekende route. */
import { FitBaseType as B, FitEncoder } from 'fit-file-parser/encoder';

const START = Date.parse('2026-11-16T07:00:00Z');
/** 11 punten, elke 30 s ~100 m naar het noorden (0,0009°), hartslag 130 → 150, hoogte 10 → 20 m. */
export const route = Array.from({ length: 11 }, (_, index) => ({
  time: new Date(START + index * 30_000).toISOString(),
  lat: 52 + index * 0.0009,
  lon: 5,
  hr: 130 + index * 2,
  ele: 10 + index
}));

export function gpx(type = 'running', extra = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">${extra}
  <trk><type>${type}</type><trkseg>
${route.map((p) => `    <trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele><time>${p.time}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${p.hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`).join('\n')}
  </trkseg></trk>
</gpx>`;
}

export function tcx(sport = 'Biking'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity Sport="${sport}"><Id>${route[0]!.time}</Id>
    <Lap StartTime="${route[0]!.time}"><TotalTimeSeconds>300</TotalTimeSeconds><DistanceMeters>1001</DistanceMeters><Calories>80</Calories>
      <Track>
${route.map((p, index) => `        <Trackpoint><Time>${p.time}</Time><Position><LatitudeDegrees>${p.lat}</LatitudeDegrees><LongitudeDegrees>${p.lon}</LongitudeDegrees></Position><AltitudeMeters>${p.ele}</AltitudeMeters><DistanceMeters>${index * 100}</DistanceMeters><HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm></Trackpoint>`).join('\n')}
      </Track>
    </Lap>
  </Activity></Activities>
</TrainingCenterDatabase>`;
}

const semicircles = (degrees: number) => Math.round((degrees * 2 ** 31) / 180);

/** FIT-activiteit met file_id, records en een sessie (hardlopen, 300 s, 1000 m). */
export function fit(): Uint8Array {
  const encoder = new FitEncoder();
  const t0 = FitEncoder.toFitTimestamp(new Date(START));
  encoder.writeMessage(0, [
    { number: 0, size: 1, baseType: B.Enum, value: 4 },
    { number: 4, size: 4, baseType: B.Uint32, value: t0 }
  ]);
  route.forEach((p, index) => {
    encoder.writeMessage(20, [
      { number: 253, size: 4, baseType: B.Uint32, value: t0 + index * 30 },
      { number: 0, size: 4, baseType: B.Sint32, value: semicircles(p.lat) },
      { number: 1, size: 4, baseType: B.Sint32, value: semicircles(p.lon) },
      { number: 2, size: 2, baseType: B.Uint16, value: (p.ele + 500) * 5 },
      { number: 3, size: 1, baseType: B.Uint8, value: p.hr },
      { number: 5, size: 4, baseType: B.Uint32, value: index * 100 * 100 }
    ], 1);
  });
  encoder.writeMessage(18, [
    { number: 2, size: 4, baseType: B.Uint32, value: t0 },
    { number: 5, size: 1, baseType: B.Enum, value: 1 },
    { number: 7, size: 4, baseType: B.Uint32, value: 300_000 },
    { number: 8, size: 4, baseType: B.Uint32, value: 290_000 },
    { number: 9, size: 4, baseType: B.Uint32, value: 100_000 },
    { number: 16, size: 1, baseType: B.Uint8, value: 140 },
    { number: 17, size: 1, baseType: B.Uint8, value: 150 }
  ], 2);
  return encoder.close();
}
