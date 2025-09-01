https://developers.line.biz/en/reference/messaging-api/#uri-action

# LINE Developers Documentation

## Action objects

### URI action
---
When a control associated with this action is tapped, the URI specified in the uri property is opened in LINE's in-app browser.

#### type String (Required)
uri

#### label String (See description)
Label for the action. The specification depends on which object the action is set to. For more information, see Specifications of the label.

#### uri String (Required)
URI opened when the action is performed (Max character limit: 1000)
The available schemes are http, https, line, and tel. For more information about the LINE URL scheme, see Use LINE features with the LINE URL scheme.

The URI should be percent-encoded using UTF-8. For more information, see About the encoding of a URL specified in a request body property.

#### altUri.desktop String (Optional)
URI opened on LINE for macOS and Windows when the action is performed (Max character limit: 1000)
If the altUri.desktop property is set, the uri property is ignored on LINE for macOS and Windows.
The available schemes are http, https, line, and tel. For more information about the LINE URL scheme, see Use LINE features with the LINE URL scheme.

The URI should be percent-encoded using UTF-8. For more information, see About the encoding of a URL specified in a request body property.

#### Note
The altUri.desktop is supported when you set URI actions in Flex Messages, but it doesn't work in quick reply.

#### Example URI action object
```json
// Example of opening a specified URL in LINE's in-app browser
{
    "type": "uri",
    "label": "Menu",
    "uri": "https://example.com/menu"
}

// Example of opening different URLs for smartphone and desktop versions of LINE
{
   "type":"uri",
   "label":"View details",
   "uri":"http://example.com/page/222",
   "altUri": {
      "desktop" : "http://example.com/pc/page/222"
   }
}

// Example of opening a call app by specifying a phone number
{
    "type": "uri",
    "label": "Phone order",
    "uri": "tel:09001234567"
}

// Example of sharing LINE Official Account through LINE URL scheme
{
    "type": "uri",
    "label": "Recommend to friends",
    "uri": "https://line.me/R/nv/recommendOA/%40linedevelopers"
}
```