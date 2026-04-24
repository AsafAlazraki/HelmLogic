import { FeatureTrackingView } from '@/components/feature-tracking-view';
import { loadReleaseNotes } from '@/lib/release-notes-loader';

export default function FeatureTrackingPage() {
    const releaseNotes = loadReleaseNotes();
    return <FeatureTrackingView releaseNotes={releaseNotes} />;
}
