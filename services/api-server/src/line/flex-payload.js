// Flex Messageのペイロード構築
export const buildEventFlexMessage = ({ title, description, imageUrl, originalImageUrl, liffUrl, heldAt }) => {
  const message = {
    type: 'flex',
    altText: `${title} - 出欠確認`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: title,
            weight: 'bold',
            size: 'lg'
          },
          {
            type: 'text',
            text: heldAt,
            size: 'sm',
            color: '#666666',
            margin: 'md'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            action: {
              type: 'uri',
              label: '出欠を回答',
              uri: liffUrl
            }
          }
        ]
      }
    }
  };

  // hero画像がある場合は追加
  if (imageUrl) {
    message.contents.hero = {
      type: 'image',
      url: imageUrl,  // プレビュー画像（必ずhttps://で始まるURL）
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
      action: {
        type: 'uri',
        uri: originalImageUrl || imageUrl  // オリジナル画像、なければプレビュー画像
      }
    };
  }

  return message;
};