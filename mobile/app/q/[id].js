// https://your-domain/q/<id> links (shared on social media) open the question inside the app
import { Redirect, useLocalSearchParams } from 'expo-router';
export default function QuestionLink() {
  const { id } = useLocalSearchParams();
  return <Redirect href={`/post/${id}`} />;
}
