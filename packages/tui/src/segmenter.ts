/** Structural segmenter. Callers only iterate `.segment()`, so this is not an Intl.Segmenter. */
export interface TextSegmenter {
	segment(input: string): Iterable<Intl.SegmentData>;
}
